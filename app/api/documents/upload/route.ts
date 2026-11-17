import { randomUUID, randomBytes } from "node:crypto";
import { findPdfBlob, validPossessionStream, pdfHash } from "@/lib/pdf-content";
import { createFromBlob } from "@/lib/cloud-store";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requestGuard } from "@/lib/http";
import { cloudEnabled, services, userRoot } from "@/lib/firebase-server";
import { listFolders } from "@/lib/folders";
import { MAX_UPLOAD_BYTES, uploadFormat } from "@/lib/upload-formats";
import { prepareUpload } from "@/lib/prepare-upload";
import { createDocument, readDocument } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;
const start = z.object({ action: z.literal("start"), name: z.string().min(1).max(255), size: z.number().int().positive().max(MAX_UPLOAD_BYTES), folderId: z.string().min(1).max(100), hash: z.string().regex(/^[a-f0-9]{64}$/).optional(), skipReuse: z.boolean().optional() });
const complete = z.object({ action: z.literal("complete"), uploadId: z.string().uuid() });
const reuse = z.object({ action: z.literal("reuse"), uploadId: z.string().uuid(), proof: z.string().regex(/^[a-f0-9]{64}$/) });

export async function POST(request: Request) {
  const denied = await requestGuard(request); if (denied) return denied;
  try {
    if (!cloudEnabled()) return NextResponse.json({ error: "Usa il caricamento locale per questo ambiente." }, { status: 400 });
    const parsed = z.union([start, complete, reuse]).safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Caricamento non valido. Limite: 500 MB per file." }, { status: 400 });
    const root = await userRoot();
    const { bucket, db } = services();
    if (parsed.data.action === "start") {
      const { name, size, folderId } = parsed.data;
      const format = uploadFormat(name);
      if (!format) return NextResponse.json({ error: "Scegli un PDF o un'immagine PNG o JPEG." }, { status: 400 });
      if (!(await listFolders()).some(folder => folder.id === folderId)) return NextResponse.json({ error: "Esame non trovato." }, { status: 400 });
      const uploadId = randomUUID();
      if (format === "pdf" && !parsed.data.skipReuse && parsed.data.hash && await findPdfBlob(parsed.data.hash, size)) {
        const nonce = randomBytes(32).toString("hex");
        await root.collection("uploads").doc(uploadId).set({ name, size, folderId, hash: parsed.data.hash, nonce, createdAt: Date.now(), state: "proof" });
        return NextResponse.json({ uploadId, nonce }, { headers: { "Cache-Control": "no-store" } });
      }
      const file = bucket.file(`${root.path}/uploads/${uploadId}/source`);
      const contentType = format === "pdf" ? "application/pdf" : format === "png" ? "image/png" : "image/jpeg";
      // JSON API resumable sessions carry the initiating origin to browser PUTs.
      const [uploadUrl] = await file.createResumableUpload({
        origin: request.headers.get("origin") || new URL(request.url).origin,
        metadata: { contentType, contentLength: size },
        preconditionOpts: { ifGenerationMatch: 0 },
      });
      await root.collection("uploads").doc(uploadId).set({ name, size, folderId, ...(parsed.data.hash ? { hash: parsed.data.hash } : {}), createdAt: Date.now(), state: "pending" });
      return NextResponse.json({ uploadId, uploadUrl, contentType }, { headers: { "Cache-Control": "no-store" } });
    }
    const { uploadId } = parsed.data;
    const ref = root.collection("uploads").doc(uploadId);
    if (parsed.data.action === "reuse") {
      const token = randomUUID();
      const data = await db.runTransaction(async tx => {
        const snapshot = await tx.get(ref), value = snapshot.data();
        if (!value) throw Object.assign(new Error("Caricamento non trovato."), { status: 404 });
        if (value.state === "completed") return value;
        if (!value.nonce || Date.now() - value.createdAt > 10 * 60000) throw Object.assign(new Error("Caricamento scaduto. Riprova."), { status: 400 });
        if (value.state === "processing" && Date.now() - value.processingAt < 5 * 60000) throw Object.assign(new Error("Caricamento in elaborazione. Attendi qualche secondo."), { status: 409 });
        tx.update(ref, { state: "processing", processingAt: Date.now(), lease: token });
        return value;
      });
      if (data.state === "completed") return NextResponse.json(await readDocument(uploadId));
      try {
        if (!(await listFolders()).some(folder => folder.id === data.folderId)) throw Object.assign(new Error("Esame non trovato."), { status: 400 });
        const blob = await findPdfBlob(data.hash, data.size);
        if (!blob) throw Object.assign(new Error("Caricamento non disponibile. Riprova."), { status: 409 });
        let verified: boolean;
        try { verified = await validPossessionStream(bucket.file(blob.path).createReadStream(), data.nonce, parsed.data.proof, blob.size); }
        catch (error) { if (Number((error as { code?: number }).code) === 404) throw Object.assign(new Error("File in aggiornamento. Riprova."), { status: 409 }); throw error; }
        if (!verified) throw Object.assign(new Error("Verifica del file non riuscita. Seleziona nuovamente il PDF."), { status: 400 });
        console.info("[PDF reuse] PDF identico verificato: trasferimento evitato", { hash: blob.hash, documentId: uploadId, pages: blob.pages });
        let result;
        try { result = await readDocument(uploadId); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
        result ||= await createFromBlob(data.name.replace(/[\x00-\x1f]/g, "").slice(0, 200), blob, data.folderId, uploadId);
        await ref.update({ state: "completed" });
        return NextResponse.json(result, { status: 201 });
      } catch (error) {
        await db.runTransaction(async tx => { const snapshot = await tx.get(ref); if (snapshot.get("lease") === token) tx.update(ref, { state: "proof" }); }).catch(() => {});
        throw error;
      }
    }
    const lease = randomUUID();
    const metadata = await db.runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) throw Object.assign(new Error("Caricamento non trovato."), { status: 404 });
      const data = snapshot.data()!;
      if (data.state === "completed") return data;
      if (data.nonce) throw Object.assign(new Error("Verifica del file non completata."), { status: 400 });
      if (Date.now() - data.createdAt > 24 * 60 * 60 * 1000) throw Object.assign(new Error("Caricamento scaduto. Seleziona nuovamente il file."), { status: 400 });
      if (data.state === "processing" && Date.now() - data.processingAt < 5 * 60 * 1000) throw Object.assign(new Error("Caricamento in elaborazione. Attendi qualche secondo."), { status: 409 });
      tx.update(ref, { state: "processing", processingAt: Date.now(), lease });
      return data;
    });
    if (metadata.state === "completed") return NextResponse.json(await readDocument(uploadId));
    const file = bucket.file(`${root.path}/uploads/${uploadId}/source`);
    try {
      // A previous completion may have persisted the document before losing its response.
      let result;
      try { result = await readDocument(uploadId); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      if (!result) {
        const [stored] = await file.getMetadata();
        if (Number(stored.size) !== metadata.size || Number(stored.size) > MAX_UPLOAD_BYTES) throw Object.assign(new Error("La dimensione del file caricato non corrisponde a quella prevista."), { status: 400 });
        if (!(await listFolders()).some(folder => folder.id === metadata.folderId)) throw Object.assign(new Error("Esame non trovato."), { status: 400 });
        const [input] = await file.download();
        if (metadata.hash && pdfHash(input) !== metadata.hash) throw Object.assign(new Error("Il file è cambiato durante il caricamento. Riprova."), { status: 400 });
        const prepared = await prepareUpload(metadata.name, input);
        result = await createDocument(prepared.name, prepared.bytes, prepared.pages, metadata.folderId, uploadId);
      }
      await ref.update({ state: "completed" });
      await file.delete({ ignoreNotFound: true }).catch(() => {});
      return NextResponse.json(result, { status: 201 });
    } catch (error) {
      await db.runTransaction(async tx => {
        const snapshot = await tx.get(ref);
        if (snapshot.get("lease") === lease) tx.update(ref, { state: "pending" });
      }).catch(() => {});
      throw error;
    }
  } catch (error) { return apiError(error); }
}
