import { getStudyProfile } from "./study-profile";
import { cloudEnabled } from "./firebase-server";
import * as cloud from "./cloud-store";
import { documentSnapshots, pdfBytes, rememberDocument } from "./content-cache";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile, link } from "node:fs/promises";
import { pdfHash } from "./pdf-content";
import { getFolder } from "./folders";
import { availableDocumentAnalysis } from "./reuse-document-analysis";
import { reusePreviousPdfAnalysis } from "./legacy-pdf-analysis";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { DocumentSummary, StudyDocument, SlideData } from "./types";

export const dataRoot = () => path.resolve(/* turbopackIgnore: true */ process.env.DATA_DIR || path.join(process.cwd(), "data"));
const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function documentDir(id: string) {
  if (!validId.test(id)) throw new Error("Documento non valido.");
  return path.join(/* turbopackIgnore: true */ dataRoot(), id);
}
export async function readDocument(id: string): Promise<StudyDocument> {
  if (cloudEnabled()) return cloud.read(id);
  const file = path.join(documentDir(id), "document.json");
  const metadata = await stat(file, { bigint: true });
  const revision = `${metadata.mtimeNs}:${metadata.ctimeNs}:${metadata.size}`;
  const cached = documentSnapshots.get(file);
  if (cached?.revision === revision) return structuredClone(cached.value);
  const doc: StudyDocument = JSON.parse(await readFile(file, "utf8"));
  rememberDocument(file, revision, doc);
  return doc;
}
export async function readDocumentMetadata(id: string): Promise<Omit<StudyDocument, "slides"> & { quizIndexVersion?: number }> {
  if (cloudEnabled()) return cloud.readMetadata(id);
  const { slides: _slides, ...metadata } = await readDocument(id);
  return metadata;
}
export async function setDocumentStudyExclusion(id: string, excludedFromStudy: boolean) {
  if (cloudEnabled()) return cloud.setStudyExclusion(id, excludedFromStudy);
  await updateDocument(id, document => { document.excludedFromStudy = excludedFromStudy; });
  return { id, excludedFromStudy };
}
async function saveDocument(doc: StudyDocument) {
  const dir = documentDir(doc.id);
  const temp = path.join(dir, `${randomUUID()}.tmp`);
  await writeFile(temp, JSON.stringify(doc, null, 2), "utf8");
  // Windows may briefly hold the destination open during a simultaneous read
  // or antivirus scan. Keep atomic replacement and retry only transient locks.
  try {
    for (let attempt = 0; ; attempt++) {
      try { await rename(temp, path.join(dir, "document.json")); documentSnapshots.delete(path.join(dir, "document.json")); break; }
      catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (process.platform !== "win32" || !["EPERM", "EACCES", "EBUSY"].includes(code || "") || attempt >= 7) throw error;
        await delay(25 * (attempt + 1));
      }
    }
  } catch (error) { await rm(temp, { force: true }).catch(() => {}); throw error; }
}
const queues = new Map<string, Promise<unknown>>();
async function inDocumentQueue<T>(id: string, operation: () => Promise<T>): Promise<T> {
  const previous = queues.get(id) || Promise.resolve();
  const task = previous.catch(() => {}).then(operation);
  queues.set(id, task);
  try { return await task; } finally { if (queues.get(id) === task) queues.delete(id); }
}
export async function updateDocument(id: string, change: (doc: StudyDocument) => void) {
  if (cloudEnabled()) return cloud.update(id, change);
  return inDocumentQueue(id, async () => {
    // Mutations always read fresh persisted data inside the write queue.
    const doc: StudyDocument = JSON.parse(await readFile(path.join(documentDir(id), "document.json"), "utf8"));
    change(doc);
    await saveDocument(doc);
    return doc;
  });
}
export async function patchDocumentPage(id: string, page: number, patch: { notes?: string; read?: boolean }) {
  if (cloudEnabled()) return cloud.patchPage(id, page, patch);
  const document = await updateDocument(id, doc => {
    if (page > doc.pages) throw Object.assign(new Error("Pagina non valida."), { status: 400 });
    if (patch.notes !== undefined || patch.read !== undefined) doc.slides[page] = { ...doc.slides[page], notes: doc.slides[page]?.notes || "", ...patch };
    else doc.currentPage = page;
  });
  const { slides, ...metadata } = document;
  return { ...metadata, readPages: Object.values(slides).filter(slide => slide.read).length, page, ...(patch.notes !== undefined || patch.read !== undefined ? { slide: slides[page] } : {}) };
}
export async function updateSlide(id: string, page: number, change: (slide: SlideData) => SlideData) {
  if (cloudEnabled()) return cloud.updateSlide(id, page, change);
  const document = await updateDocument(id, doc => { doc.slides[page] = change(doc.slides[page] || { notes: "" }); });
  return document.slides[page];
}
export async function readVersionedDocument(id: string, etag?: string | null) {
  if (cloudEnabled()) return cloud.versionedRead(id, etag);
  const document = await readDocument(id);
  const metadata = await stat(path.join(documentDir(id), "document.json"), { bigint: true });
  const version = `"${metadata.mtimeNs}-${metadata.ctimeNs}-${metadata.size}"`;
  return { etag: version, document: etag === version ? null : document };
}
export async function createDocument(name: string, bytes: Uint8Array, pages: number, folderId?: string, id: string = randomUUID()) {
  if (cloudEnabled()) return cloud.create(name, bytes, pages, folderId, id);
  const profile = await getStudyProfile();
  const doc: StudyDocument = { provenance: { university: profile.university || "", studyProgram: profile.studyProgram, authorName: profile.displayName || "Studente" }, id, name, pages, size: bytes.length, createdAt: new Date().toISOString(), currentPage: 1, slides: {}, ...(folderId ? { folderId } : {}) };
  doc.contentHash = pdfHash(bytes);
  const folder = await getFolder(folderId);
  doc.slides = await availableDocumentAnalysis(doc.contentHash, pages, profile.studyProgram, folder?.name);
  if (Object.keys(doc.slides).length < pages) {
    await mkdir(dataRoot(), { recursive: true });
    const entries = await readdir(dataRoot(), { withFileTypes: true });
    const previous = await Promise.all(entries.filter(entry => entry.isDirectory() && validId.test(entry.name)).map(async entry => {
      try { return await readDocument(entry.name); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
    }));
    await reusePreviousPdfAnalysis({ id, hash: doc.contentHash, pages, size: bytes.length }, previous.flatMap(source => source && (!source.provenance || source.provenance.studyProgram === profile.studyProgram) ? [{
      id: source.id, pages: source.pages, size: source.size, contentHash: source.contentHash,
      loadBytes: () => readPdf(source.id),
      saveHash: (hash: string) => updateDocument(source.id, document => { document.contentHash = hash; }),
      loadSlides: async () => source.slides,
    }] : []), doc.slides);
  }
  await mkdir(documentDir(doc.id), { recursive: true });
  try {
    const blobDir = path.join(dataRoot(), ".pdf-content");
    await mkdir(blobDir, { recursive: true });
    const blob = path.join(blobDir, `${doc.contentHash}.pdf`);
    for (let attempt = 0; ; attempt++) {
      try {
        await stat(blob);
        console.info("[PDF reuse] PDF identico già presente nello storage", { documentId: id, hash: doc.contentHash, bytes: bytes.length });
      }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        const temporary = path.join(blobDir, `${doc.contentHash}.${randomUUID()}.tmp`);
        try {
          await writeFile(temporary, bytes);
          try { await link(temporary, blob); }
          catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
        } finally { await rm(temporary, { force: true }); }
      }
      try { await link(blob, path.join(documentDir(doc.id), "original.pdf")); break; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT" || attempt >= 3) throw error; }
    }
    await saveDocument(doc);
    const analyzedPages = Object.values(doc.slides).filter(slide => slide.explanation).length;
    console.info("[PDF reuse] Analisi disponibili al caricamento", { documentId: id, analyzedPages, pages, fullyAnalyzed: analyzedPages === pages });
  } catch (error) { await rm(documentDir(doc.id), { recursive: true, force: true }); throw error; }
  return doc;
}
export async function listDocuments(): Promise<DocumentSummary[]> {
  if (cloudEnabled()) return await cloud.list() as DocumentSummary[];
  await mkdir(dataRoot(), { recursive: true });
  const entries = await readdir(/* turbopackIgnore: true */ dataRoot(), { withFileTypes: true });
  const docs = await Promise.all(entries.filter(e => e.isDirectory() && validId.test(e.name)).map(async e => {
    try {
      const { slides, ...doc } = await readDocument(e.name);
      return { ...doc, readPages: Object.values(slides).filter(s => s.read).length, analyzedPages: Object.values(slides).filter(s => s.explanation).length };
    } catch (error) {
      // A new upload may not have metadata yet; a deletion may finish mid-list.
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }));
  return docs.filter(doc => doc !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function deleteDocument(id: string) {
  if (cloudEnabled()) return cloud.remove(id);
  return inDocumentQueue(id, async () => {
    try {
      const document = await readDocument(id);
      const original = await stat(path.join(documentDir(id), "original.pdf"));
      if (document.contentHash && /^[a-f0-9]{64}$/.test(document.contentHash) && original.nlink <= 2) await rm(path.join(dataRoot(), ".pdf-content", `${document.contentHash}.pdf`), { force: true });
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    // A previous removal may have deleted metadata before the PDF. Retry the
    // validated directory itself so remaining files cannot become orphans.
    await rm(documentDir(id), { recursive: true, force: true });
    documentSnapshots.delete(path.join(documentDir(id), "document.json"));
    pdfBytes.delete(path.join(documentDir(id), "original.pdf"));
  });
}
export async function readPdf(id: string) {
  if (cloudEnabled()) return cloud.pdf(id);
  const file = path.join(documentDir(id), "original.pdf");
  const metadata = await stat(file, { bigint: true });
  const revision = `${metadata.mtimeNs}:${metadata.ctimeNs}:${metadata.size}`;
  const cached = pdfBytes.get(file);
  if (cached?.revision === revision) return Buffer.from(cached.value);
  const bytes = await readFile(file);
  pdfBytes.set(file, { revision, value: Buffer.from(bytes) }, bytes.byteLength);
  return bytes;
}
