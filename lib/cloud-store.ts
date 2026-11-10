import { applyPagePatch } from "./cloud-page-patch";
import type { DocumentReference } from "firebase-admin/firestore";
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
export async function readMetadata(id: string) {
  const snapshot = await (await ref(id)).get();
  if (!snapshot.exists || snapshot.get("deleting")) throw missing();
  return snapshot.data() as Omit<StudyDocument, "slides"> & { quizIndexVersion?: number };
}
export async function markQuizIndex(id: string) {
  await (await ref(id)).update({ quizIndexVersion: 1 });
}
export async function create(name: string, bytes: Uint8Array, pages: number, folderId?: string) {
  const root = await userRoot();
  const doc: StudyDocument = { id: randomUUID(), name, pages, size: bytes.length, createdAt: new Date().toISOString(), currentPage: 1, slides: {}, ...(folderId ? { folderId } : {}) };
  const file = services().bucket.file(`${root.path}/documents/${doc.id}/original.pdf`);
  await file.save(Buffer.from(bytes), { resumable: false, contentType: "application/pdf" });
  try { const { slides: _slides, ...meta } = doc; await root.collection("documents").doc(doc.id).set({ ...meta, analyzedPages: 0, readPages: 0, quizIndexVersion: 1, contentRevision: randomUUID() }); }
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

// The common reader operations touch at most one slide, never its collection.
export async function patchPage(id: string, page: number, patch: { notes?: string; read?: boolean }) {
  const r = await ref(id);
  const result = await services().db.runTransaction(async tx => {
    return applyPagePatch(tx, r, page, patch);
  });
  const cached = documentSnapshots.get(r.path);
  const metadata = result as typeof result & { contentRevision?: string };
  if (cached && result.previousContentRevision === cached.revision && metadata.contentRevision) {
    const { page: _page, slide, previousContentRevision: _previous, ...fields } = metadata;
    rememberDocument(r.path, metadata.contentRevision, { ...cached.value, ...fields, slides: slide ? { ...cached.value.slides, [page]: slide } : cached.value.slides });
  } else if (patch.notes !== undefined || patch.read !== undefined) documentSnapshots.delete(r.path);
  return result;
}

export async function updateSlide(id: string, page: number, change: (slide: SlideData) => SlideData) {
  const r = await ref(id);
  const slideRef = r.collection("slides").doc(String(page));
  const result = await services().db.runTransaction(async tx => {
    const meta = await tx.get(r);
    if (!meta.exists || meta.get("deleting")) throw missing();
    if (page > meta.get("pages")) throw Object.assign(new Error("Pagina non valida."), { status: 400 });
    const previous = await tx.get(slideRef);
    const before = (previous.data() || { notes: "" }) as SlideData;
    const slide = change(structuredClone(before));
    tx.set(slideRef, JSON.parse(JSON.stringify(slide)));
    const revision = randomUUID();
    const metadata = { contentRevision: revision, analyzedPages: Math.max(0, (meta.get("analyzedPages") || 0) + Number(!!slide.explanation) - Number(!!before.explanation)), readPages: Math.max(0, (meta.get("readPages") || 0) + Number(!!slide.read) - Number(!!before.read)) };
    tx.update(r, metadata);
    return { slide, revision, beforeRevision: meta.get("contentRevision"), metadata: { ...meta.data(), ...metadata } };
  });
  const cached = documentSnapshots.get(r.path);
  if (cached && cached.revision === result.beforeRevision) rememberDocument(r.path, result.revision, { ...cached.value, ...result.metadata, slides: { ...cached.value.slides, [page]: result.slide } });
  else documentSnapshots.delete(r.path);
  return result.slide;
}

export async function versionedRead(id: string, etag?: string | null) {
  return readVersionedSnapshot(await ref(id), etag);
}
export async function readVersionedSnapshot(r: DocumentReference, etag?: string | null) {
  const meta = await r.get();
  if (!meta.exists || meta.get("deleting")) throw missing();
  // Position/name changes must not force a download of every explanation.
  const version = `"${meta.get("contentRevision") || `${meta.updateTime!.seconds}-${meta.updateTime!.nanoseconds}`}"`;
  if (etag === version) return { etag: version, document: null, metadata: meta.data() };
  const revision = meta.get("contentRevision") || version;
  const cached = documentSnapshots.get(r.path);
  const slides = cached && cached.revision === revision ? structuredClone(cached.value.slides)
    : Object.fromEntries((await r.collection("slides").get()).docs.map(slide => [slide.id, slide.data()]));
  const document = { ...meta.data(), slides } as StudyDocument;
  rememberDocument(r.path, revision, document);
  return { etag: version, document };
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
