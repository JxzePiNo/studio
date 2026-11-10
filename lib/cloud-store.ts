import { randomUUID } from "node:crypto";
import { documentSnapshots, pdfBytes, rememberDocument } from "./content-cache";
import { services, userRoot } from "./firebase-server";
import type { StudyDocument, SlideData } from "./types";

function checkId(id: string) { if (!/^[a-zA-Z0-9-]{1,100}$/.test(id)) throw Object.assign(new Error("Documento non valido."), { status: 400 }); }
async function ref(id: string) { checkId(id); return (await userRoot()).collection("documents").doc(id); }
function missing() { return Object.assign(new Error("Documento non trovato."), { code: "ENOENT" }); }
export async function read(id: string): Promise<StudyDocument> {
  const r = await ref(id);
  // Verify the authenticated owner's current metadata before any cache hit.
  const meta = await r.get();
  if (!meta.exists || meta.get("deleting")) { documentSnapshots.delete(r.path); throw missing(); }
  const revision = meta.get("contentRevision") || `${meta.updateTime!.seconds}:${meta.updateTime!.nanoseconds}`;
  const cached = documentSnapshots.get(r.path);
  if (cached && cached.revision === revision) return { ...meta.data(), slides: structuredClone(cached.value.slides) } as StudyDocument;
  const slides = await r.collection("slides").get();
  const doc = { ...meta.data(), slides: Object.fromEntries(slides.docs.map(s => [s.id, s.data()])) } as StudyDocument;
  rememberDocument(r.path, revision, doc);
  return doc;
}
export async function list() {
  const snapshot = await (await userRoot()).collection("documents").get();
  return snapshot.docs.filter(d => !d.get("deleting")).map(d => d.data()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function create(name: string, bytes: Uint8Array, pages: number, folderId?: string) {
  const root = await userRoot();
  const doc: StudyDocument = { id: randomUUID(), name, pages, size: bytes.length, createdAt: new Date().toISOString(), currentPage: 1, slides: {}, ...(folderId ? { folderId } : {}) };
  const file = services().bucket.file(`${root.path}/documents/${doc.id}/original.pdf`);
  await file.save(Buffer.from(bytes), { resumable: false, contentType: "application/pdf" });
  try { const { slides: _slides, ...meta } = doc; await root.collection("documents").doc(doc.id).set({ ...meta, analyzedPages: 0, readPages: 0, contentRevision: randomUUID() }); }
  catch (e) { await file.delete().catch(() => {}); throw e; }
  return doc;
}
export async function update(id: string, change: (doc: StudyDocument) => void) {
  const r = await ref(id);
  return services().db.runTransaction(async tx => {
    const meta = await tx.get(r);
    const snapshot = await tx.get(r.collection("slides"));
    if (!meta.exists || meta.get("deleting")) throw missing();
    const slides = Object.fromEntries(snapshot.docs.map(s => [s.id, s.data() as SlideData]));
    const before = JSON.stringify(slides);
    const old = JSON.parse(before) as Record<string, SlideData>;
    const doc = { ...meta.data(), slides } as StudyDocument;
    change(doc);
    for (const [page, data] of Object.entries(doc.slides)) {
      if (JSON.stringify(old[page]) !== JSON.stringify(data)) tx.set(r.collection("slides").doc(page), JSON.parse(JSON.stringify(data)));
    }
    const { slides: updated, ...metadata } = doc;
    tx.set(r, { ...metadata, contentRevision: before === JSON.stringify(updated) ? meta.get("contentRevision") || randomUUID() : randomUUID(), readPages: Object.values(updated).filter(s => s.read).length, analyzedPages: Object.values(updated).filter(s => s.explanation).length });
    return doc;
  });
}
export async function pdf(id: string) {
  const r = await ref(id);
  const meta = await r.get();
  if (!meta.exists || meta.get("deleting")) { pdfBytes.delete(r.path); throw missing(); }
  // Original PDFs are immutable; metadata changes never invalidate these bytes.
  const cached = pdfBytes.get(r.path);
  if (cached) return Buffer.from(cached.value);
  const bytes = (await services().bucket.file(`${r.path}/original.pdf`).download())[0];
  pdfBytes.set(r.path, { revision: "original", value: Buffer.from(bytes) }, bytes.byteLength);
  return bytes;
}
export async function remove(id: string) {
  const r = await ref(id);
  await services().db.runTransaction(async tx => { if (!(await tx.get(r)).exists) throw missing(); tx.update(r, { deleting: true }); });
  documentSnapshots.delete(r.path); pdfBytes.delete(r.path);
  await services().bucket.file(`${r.path}/original.pdf`).delete({ ignoreNotFound: true });
  await services().db.recursiveDelete(r);
}
