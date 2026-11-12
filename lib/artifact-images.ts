import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { cloudEnabled, services, userRoot } from "./firebase-server";
import { documentDir, readDocumentMetadata } from "./store";

function check(assetId: string) { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(assetId)) throw Object.assign(new Error("Immagine non valida."), { status: 400 }); }
async function location(documentId: string, assetId: string, requireDocument = true) {
  check(assetId); check(documentId);
  if (requireDocument) await readDocumentMetadata(documentId);
  if (cloudEnabled()) return { file: services().bucket.file(`${(await userRoot()).path}/documents/${documentId}/visuals/${assetId}.png`) };
  return { local: path.join(documentDir(documentId), "visuals", `${assetId}.png`) };
}
export async function saveArtifactImage(documentId: string, assetId: string, bytes: Uint8Array) {
  const target = await location(documentId, assetId);
  if (target.file) await target.file.save(Buffer.from(bytes), { resumable: false, contentType: "image/png" });
  else { await mkdir(path.dirname(target.local!), { recursive: true }); await writeFile(target.local!, bytes); }
}
export async function readArtifactImage(documentId: string, assetId: string): Promise<Uint8Array> {
  const target = await location(documentId, assetId);
  // These files are user uploads created at runtime, never bundled application assets.
  if (!target.file) return readFile(/* turbopackIgnore: true */ target.local!);
  try { return (await target.file.download())[0]; }
  catch (error) { if ((error as { code?: number }).code === 404) throw Object.assign(new Error("Immagine non trovata."), { code: "ENOENT" }); throw error; }
}
export async function removeArtifactImage(documentId: string, assetId: string) {
  // A document can be deleted while generation is finishing. Rollback still
  // removes its private asset in the current user's namespace in that case.
  const target = await location(documentId, assetId, false);
  if (target.file) await target.file.delete({ ignoreNotFound: true }); else await rm(target.local!, { force: true });
}
