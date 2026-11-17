import { createHash, timingSafeEqual } from "node:crypto";
import { services } from "./firebase-server";
import type { DocumentReference, Transaction } from "firebase-admin/firestore";

export const pdfHash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
export type PdfBlob = { hash: string; path: string; size: number; pages: number };

export async function findPdfBlob(hash: string, size: number): Promise<PdfBlob | undefined> {
  if (!/^[a-f0-9]{64}$/.test(hash)) return;
  const data = (await services().db.collection("sharedBlobs").doc(hash).get()).data();
  if (data?.hash !== hash || data.deleting || data.size !== size || !Number.isInteger(data.pages)) return;
  return data as PdfBlob;
}

/** Only server-validated bytes may enter this immutable content-addressed store. */
export async function storePdfBlob(bytes: Uint8Array, pages: number): Promise<PdfBlob> {
  const hash = pdfHash(bytes);
  const existing = await findPdfBlob(hash, bytes.length);
  if (existing && (await services().bucket.file(existing.path).exists())[0]) {
    console.info("[PDF reuse] PDF identico già presente nello storage", { hash, bytes: bytes.length });
    return existing;
  }
  const blob: PdfBlob = { hash, path: `pdf-content/${hash}/original.pdf`, size: bytes.length, pages };
  try { await services().bucket.file(blob.path).save(Buffer.from(bytes), { resumable: false, contentType: "application/pdf", preconditionOpts: { ifGenerationMatch: 0 } }); }
  catch (error) { if (Number((error as { code?: number }).code) !== 412) throw error; }
  await services().db.runTransaction(async tx => {
    const ref = services().db.collection("sharedBlobs").doc(hash);
    const current = await tx.get(ref);
    if (current.get("deleting")) throw Object.assign(new Error("File in aggiornamento. Riprova tra poco."), { status: 409 });
    tx.set(ref, { ...current.data(), ...blob });
  });
  return blob;
}

export function blobReferenceId(documentPath: string) { return createHash("sha256").update(documentPath).digest("hex"); }
export function retainPdfBlob(tx: Transaction, blob: DocumentReference, documentPath: string) {
  tx.set(blob.collection("references").doc(blobReferenceId(documentPath)), { documentPath });
}

/** Publication keeps the original backing blob alive, as in the sharing system. */
export async function releasePdfBlob(hash: string, documentPath: string) {
  const { db, bucket } = services(), ref = db.collection("sharedBlobs").doc(hash);
  const id = blobReferenceId(documentPath);
  const remove = await db.runTransaction(async tx => {
    const blob = await tx.get(ref);
    if (!blob.exists) return undefined;
    const refs = await tx.get(ref.collection("references").limit(2));
    const used = refs.docs.some(doc => doc.id !== id);
    tx.delete(ref.collection("references").doc(id));
    if (used || blob.get("retained")) return undefined;
    tx.update(ref, { deleting: true });
    return blob.get("path") as string;
  });
  if (!remove) return;
  await bucket.file(remove).delete({ ignoreNotFound: true });
  await ref.delete();
}

export function possessionProof(bytes: Uint8Array, nonce: string) {
  return createHash("sha256").update(nonce).update(bytes).digest("hex");
}
export function validPossession(bytes: Uint8Array, nonce: string, proof: string) {
  return /^[a-f0-9]{64}$/.test(proof) && timingSafeEqual(Buffer.from(possessionProof(bytes, nonce), "hex"), Buffer.from(proof, "hex"));
}

export async function validPossessionStream(chunks: AsyncIterable<Uint8Array>, nonce: string, proof: string, size: number) {
  const hash = createHash("sha256").update(nonce);
  let length = 0;
  for await (const chunk of chunks) {
    length += chunk.length;
    if (length > size) return false;
    hash.update(chunk);
  }
  return length === size && /^[a-f0-9]{64}$/.test(proof) && timingSafeEqual(hash.digest(), Buffer.from(proof, "hex"));
}
