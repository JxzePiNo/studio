import { cloudEnabled } from "./firebase-server";
import * as cloud from "./cloud-store";
import { documentSnapshots, pdfBytes, rememberDocument } from "./content-cache";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
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
export async function createDocument(name: string, bytes: Uint8Array, pages: number, folderId?: string) {
  if (cloudEnabled()) return cloud.create(name, bytes, pages, folderId);
  const doc: StudyDocument = { id: randomUUID(), name, pages, size: bytes.length, createdAt: new Date().toISOString(), currentPage: 1, slides: {}, ...(folderId ? { folderId } : {}) };
  await mkdir(documentDir(doc.id), { recursive: true });
  try {
    await writeFile(path.join(documentDir(doc.id), "original.pdf"), bytes);
    await saveDocument(doc);
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
