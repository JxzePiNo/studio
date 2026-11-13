import { personalProgress, patchPersonalProgress } from "./shared-progress";
import { sharedChatView } from "./shared-chat";
import { documentReference, folderReference, collaborativeWorkspaces } from "./shared-access";
import { getStudyProfile } from "./study-profile";
import { applyPagePatch } from "./cloud-page-patch";
import type { DocumentReference } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";
import { documentSnapshots, pdfBytes, rememberDocument } from "./content-cache";
import { services, userRoot, userId } from "./firebase-server";
import type { StudyDocument, SlideData } from "./types";

function checkId(id: string) { if (!/^[a-zA-Z0-9-]{1,100}$/.test(id)) throw Object.assign(new Error("Documento non valido."), { status: 400 }); }
async function ref(id: string) { checkId(id); return documentReference(id); }
function missing() { return Object.assign(new Error("Documento non trovato."), { code: "ENOENT" }); }
async function visibleDocument(document: StudyDocument): Promise<StudyDocument> {
  const uid = await userId();
  const space = document.folderId ? (await services().db.collection("sharedWorkspaces").doc(document.folderId).get()).data() : undefined;
  const since = space?.ownerId !== uid ? space?.chatSince?.[uid] || 0 : 0;
  const visible = { ...document, slides: Object.fromEntries(Object.entries(document.slides).map(([page, slide]) => [page, { ...slide, ...(slide.chat ? { chat: sharedChatView(slide.chat, uid, space?.ownerId || uid, since) } : {}) }])) };
  return space ? personalProgress(services().db, uid, space.ownerId, visible) : visible;
}
export async function read(id: string): Promise<StudyDocument> {
  const r = await ref(id);
  // Verify the authenticated owner's current metadata before any cache hit.
  const meta = await r.get();
  if (!meta.exists || meta.get("deleting")) { documentSnapshots.delete(r.path); throw missing(); }
  const revision = meta.get("contentRevision") || `${meta.updateTime!.seconds}:${meta.updateTime!.nanoseconds}`;
  const cached = documentSnapshots.get(r.path);
  if (cached && cached.revision === revision) return visibleDocument({ ...meta.data(), slides: structuredClone(cached.value.slides) } as StudyDocument);
  const slides = await r.collection("slides").get();
  const doc = { ...meta.data(), slides: Object.fromEntries(slides.docs.map(s => [s.id, s.data()])) } as StudyDocument;
  rememberDocument(r.path, revision, doc);
  return visibleDocument(doc);
}
export async function list() {
  const snapshot = await (await userRoot()).collection("documents").get();
  const shared = await collaborativeWorkspaces();
  const others = await Promise.all(shared.map(async space => (await services().db.collection("users").doc(space.ownerId).collection("documents").where("folderId", "==", space.id).get()).docs));
  const all = [...snapshot.docs, ...others.flat()].filter(d => !d.get("deleting"));
  const root = await userRoot();
  const spaces = await collaborativeWorkspaces(true);
  const ids = new Set(spaces.map(space => space.id));
  const documents = await Promise.all(all.map(async doc => {
    const data = doc.data()!;
    if (!ids.has(data.folderId)) return data;
    const state = await root.collection("readingStates").doc(doc.id).get();
    const owner = doc.ref.parent.parent!.id === root.id;
    return { ...data, currentPage: state.get("currentPage") || (owner ? data.currentPage : 1), readPages: state.get("readPages") ?? (owner ? data.readPages || 0 : 0) };
  }));
  return documents.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function readMetadata(id: string) {
  const snapshot = await (await ref(id)).get();
  if (!snapshot.exists || snapshot.get("deleting")) throw missing();
  const raw = snapshot.data() as StudyDocument;
  const { slides: _slides, ...metadata } = await visibleDocument({ ...raw, slides: {} });
  return metadata;
}
export async function markQuizIndex(id: string) {
  await (await ref(id)).update({ quizIndexVersion: 1 });
}
export async function create(name: string, bytes: Uint8Array, pages: number, folderId?: string, id: string = randomUUID()) {
  const root = folderId ? (await folderReference(folderId)).parent.parent! : await userRoot();
  const profile = await getStudyProfile();
  const doc: StudyDocument = { id, name, pages, size: bytes.length, createdAt: new Date().toISOString(), currentPage: 1, slides: {}, provenance: { university: profile.university || "", studyProgram: profile.studyProgram, authorName: profile.displayName || "Studente" }, ...(folderId ? { folderId } : {}) };
  const file = services().bucket.file(`${root.path}/documents/${doc.id}/original.pdf`);
  await file.save(Buffer.from(bytes), { resumable: false, contentType: "application/pdf" });
  try {
    const { slides: _slides, ...meta } = doc;
    const space = folderId ? await services().db.collection("sharedWorkspaces").doc(folderId).get() : undefined;
    await services().db.runTransaction(async tx => {
      tx.set(root.collection("documents").doc(doc.id), { ...meta, analyzedPages: 0, readPages: 0, quizIndexVersion: 1, contentRevision: randomUUID() });
      if (space?.exists) tx.set(services().db.collection("collaborativeDocuments").doc(doc.id), { ownerId: root.id, folderId });
    });
  }
  catch (e) { await file.delete().catch(() => {}); throw e; }
  return doc;
}
export async function update(id: string, change: (doc: StudyDocument) => void) {
  const r = await ref(id);
  const uid = await userId();
  return services().db.runTransaction(async tx => {
    const meta = await tx.get(r);
    const snapshot = await tx.get(r.collection("slides"));
    if (!meta.exists || meta.get("deleting")) throw missing();
    const slides = Object.fromEntries(snapshot.docs.map(s => [s.id, s.data() as SlideData]));
    const before = JSON.stringify(slides);
    const old = JSON.parse(before) as Record<string, SlideData>;
    const doc = { ...meta.data(), slides } as StudyDocument;
    change(doc);
    let pointer: { ownerId: string; folderId: string } | null | undefined;
    if (doc.folderId !== meta.get("folderId")) {
      if (r.parent.parent!.id !== uid) throw Object.assign(new Error("Solo l’autore può spostare un PDF fuori dallo spazio condiviso."), { status: 403 });
      const folder = doc.folderId ? await tx.get(r.parent.parent!.collection("folders").doc(doc.folderId)) : undefined;
      if (doc.folderId && !folder?.exists) throw Object.assign(new Error("Sposta il PDF in un tuo corso personale."), { status: 403 });
      const shared = doc.folderId ? await tx.get(services().db.collection("sharedWorkspaces").doc(doc.folderId)) : undefined;
      pointer = shared?.exists && doc.folderId ? { ownerId: uid, folderId: doc.folderId } : null;
    }
    for (const [page, data] of Object.entries(doc.slides)) {
      if (JSON.stringify(old[page]) !== JSON.stringify(data)) tx.set(r.collection("slides").doc(page), JSON.parse(JSON.stringify(data)));
    }
    const { slides: updated, ...metadata } = doc;
    if (pointer === null) tx.delete(services().db.collection("collaborativeDocuments").doc(id));
    else if (pointer) tx.set(services().db.collection("collaborativeDocuments").doc(id), pointer);
    tx.set(r, { ...metadata, contentRevision: before === JSON.stringify(updated) ? meta.get("contentRevision") || randomUUID() : randomUUID(), readPages: Object.values(updated).filter(s => s.read).length, analyzedPages: Object.values(updated).filter(s => s.explanation).length });
    return visibleDocument(doc);
  });
}

// The common reader operations touch at most one slide, never its collection.
export async function patchPage(id: string, page: number, patch: { notes?: string; read?: boolean }) {
  const r = await ref(id);
  const meta = await r.get();
  const space = meta.get("folderId") ? await services().db.collection("sharedWorkspaces").doc(meta.get("folderId")).get() : undefined;
  if (space?.exists) {
    if (patch.notes !== undefined) await services().db.runTransaction(tx => applyPagePatch(tx, r, page, { notes: patch.notes }));
    const result = await patchPersonalProgress(services().db, await userId(), r, page, patch.read);
    if (result.slide) { const visible = await visibleDocument({ ...meta.data(), slides: { [page]: result.slide } } as unknown as StudyDocument); result.slide = visible.slides[page] as typeof result.slide; }
    if (patch.notes !== undefined) documentSnapshots.delete(r.path);
    return result;
  }
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
    const existing = new Set((before.chat || []).map(message => JSON.stringify(message)));
    if (slide.chat) slide.chat = slide.chat.map(message => message.sharedAt !== undefined || existing.has(JSON.stringify(message)) ? message : { ...message, sharedAt: Date.now() });
    tx.set(slideRef, JSON.parse(JSON.stringify(slide)));
    const revision = randomUUID();
    const metadata = { contentRevision: revision, analyzedPages: Math.max(0, (meta.get("analyzedPages") || 0) + Number(!!slide.explanation) - Number(!!before.explanation)), readPages: Math.max(0, (meta.get("readPages") || 0) + Number(!!slide.read) - Number(!!before.read)) };
    tx.update(r, metadata);
    return { slide, revision, beforeRevision: meta.get("contentRevision"), metadata: { ...meta.data(), ...metadata } };
  });
  const cached = documentSnapshots.get(r.path);
  if (cached && cached.revision === result.beforeRevision) rememberDocument(r.path, result.revision, { ...cached.value, ...result.metadata, slides: { ...cached.value.slides, [page]: result.slide } });
  else documentSnapshots.delete(r.path);
  const visible = await visibleDocument({ ...result.metadata, slides: { [page]: result.slide } } as unknown as StudyDocument);
  return visible.slides[page];
}

export async function versionedRead(id: string, etag?: string | null) {
  const result = await readVersionedSnapshot(await ref(id), etag);
  const { slides: _slides, ...metadata } = await visibleDocument({ ...result.metadata, slides: {} } as StudyDocument);
  return { ...result, metadata, document: result.document ? await visibleDocument(result.document) : null };
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
  const blobId = meta.get("sharedBlobId");
  const blob = blobId ? await services().db.collection("sharedBlobs").doc(blobId).get() : undefined;
  if (blobId && !blob?.exists) throw missing();
  const bytes = (await services().bucket.file(blob?.get("path") || `${r.path}/original.pdf`).download())[0];
  pdfBytes.set(r.path, { revision: "original", value: Buffer.from(bytes) }, bytes.byteLength);
  return bytes;
}
export async function remove(id: string) {
  const r = await ref(id);
  await services().db.runTransaction(async tx => { if (!(await tx.get(r)).exists) throw missing(); tx.update(r, { deleting: true }); });
  documentSnapshots.delete(r.path); pdfBytes.delete(r.path);
  const retained = (await r.get()).get("sharedBlobId");
  // Published originals remain immutable backing blobs for personal copies.
  if (!retained) {
    await services().bucket.file(`${r.path}/original.pdf`).delete({ ignoreNotFound: true });
    await services().bucket.deleteFiles({ prefix: `${r.path}/visuals/` });
  }
  await services().db.collection("collaborativeDocuments").doc(id).delete();
  await services().db.recursiveDelete(r);
}
