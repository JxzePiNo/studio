import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename, open, rm, stat } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { cloudEnabled, services } from "./firebase-server";
import type { PdfTextIndex } from "./pdf-search";

export type RagRecord = { fileId?: string; vectorStoreId?: string; ready?: boolean; createdAt?: number; owner?: string; leaseUntil?: number; usageBytes?: number };
const root = () => path.resolve(/* turbopackIgnore: true */ process.env.DATA_DIR || path.join(process.cwd(), "data"), ".pdf-rag");
export function ragKey(hash: string) {
  // Separate OpenAI accounts/configurations and future index formats, without storing credentials.
  return createHash("sha256").update(JSON.stringify(["page-text-v1", hash, process.env.OPENAI_API_KEY, process.env.OPENAI_PROJECT_ID || "", process.env.OPENAI_ORG_ID || ""])).digest("hex");
}
export async function ragRecord(key: string): Promise<RagRecord> {
  if (cloudEnabled()) return (await services().db.collection("pdfRagIndexes").doc(key).get()).data() || {};
  try { return JSON.parse(await readFile(path.join(root(), `${key}.json`), "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return {}; throw error; }
}
export async function writeRagRecord(key: string, value: RagRecord) {
  if (cloudEnabled()) { await services().db.collection("pdfRagIndexes").doc(key).set(value); return; }
  await mkdir(root(), { recursive: true });
  const temporary = path.join(root(), `${key}.${randomUUID()}.tmp`);
  try { await writeFile(temporary, JSON.stringify(value)); await rename(temporary, path.join(root(), `${key}.json`)); }
  finally { await rm(temporary, { force: true }); }
}
export async function savedRagText(key: string): Promise<PdfTextIndex | undefined> {
  try {
    const bytes = cloudEnabled() ? (await services().bucket.file(`pdf-rag/${key}/text.json`).download())[0] : await readFile(path.join(root(), `${key}.text.json`));
    return JSON.parse(bytes.toString());
  } catch (error) { if ([404, "404", "ENOENT"].includes((error as { code: string | number }).code)) return; throw error; }
}
export async function saveRagText(key: string, index: PdfTextIndex) {
  const bytes = JSON.stringify(index);
  if (cloudEnabled()) { await services().bucket.file(`pdf-rag/${key}/text.json`).save(bytes, { resumable: false, contentType: "application/json" }); return; }
  await mkdir(root(), { recursive: true });
  const temporary = path.join(root(), `${key}.${randomUUID()}.text.tmp`);
  try { await writeFile(temporary, bytes); await rename(temporary, path.join(root(), `${key}.text.json`)); }
  finally { await rm(temporary, { force: true }); }
}

/** A cross-process lease prevents duplicate paid indexing across server instances. */
export async function withRagLease<T>(key: string, operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  const owner = randomUUID(), deadline = Date.now() + 210_000;
  const lockPath = path.join(root(), `${key}.lock`);
  for (;;) {
    signal?.throwIfAborted();
    let acquired = false;
    if (cloudEnabled()) {
      const ref = services().db.collection("pdfRagIndexes").doc(key);
      acquired = await services().db.runTransaction(async tx => {
        const previous = (await tx.get(ref)).data() || {};
        if (previous.leaseUntil > Date.now()) return false;
        tx.set(ref, { ...previous, owner, leaseUntil: Date.now() + 330_000 }); return true;
      });
    } else {
      await mkdir(root(), { recursive: true });
      try { const handle = await open(lockPath, "wx"); await handle.close(); acquired = true; }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        try { if (Date.now() - (await stat(lockPath)).mtimeMs > 330_000) await rm(lockPath, { force: true }); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      }
    }
    if (acquired) break;
    if (Date.now() >= deadline) throw Object.assign(new Error("Il PDF è in indicizzazione. Riprova tra poco."), { status: 409 });
    await delay(500, undefined, { signal });
  }
  try { return await operation(); }
  finally {
    if (cloudEnabled()) {
      const ref = services().db.collection("pdfRagIndexes").doc(key);
      await services().db.runTransaction(async tx => { const current = await tx.get(ref); if (current.get("owner") === owner) tx.update(ref, { owner: "", leaseUntil: 0 }); });
    } else await rm(lockPath, { force: true });
  }
}
