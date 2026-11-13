import { folderReference, collaborativeWorkspaces, assertCourseOwner } from "./shared-access";
import { getStudyProfile } from "./study-profile";
import { publicFeedId } from "./sharing";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { cloudEnabled, services, userRoot } from "./firebase-server";
import { dataRoot, deleteDocument, listDocuments } from "./store";
import { runParallelFiles } from "./parallel-analysis";
import type { ExamFolder, StudyAvailability } from "./types";
import { examColors } from "./exam-colors";
import { validExamCfu } from "./exam-cfu";
import { MemoryCache } from "./memory-cache";

const courseContextCache = new MemoryCache<ExamFolder>({ maxEntries: 128, maxBytes: 1024 * 1024, ttlMs: 30_000 });
export async function getFolder(id?: string): Promise<ExamFolder | undefined> {
  if (!id) return;
  if (!cloudEnabled()) return (await listFolders()).find(folder => folder.id === id);
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(id)) return;
  const reference = await folderReference(id);
  const cached = courseContextCache.get(reference.path);
  if (cached) return structuredClone(cached);
  const snapshot = await reference.get();
  if (!snapshot.exists) return;
  const folder = snapshot.data() as ExamFolder;
  courseContextCache.set(reference.path, folder, Buffer.byteLength(JSON.stringify(folder)));
  return structuredClone(folder);
}

export async function listFolders(): Promise<ExamFolder[]> {
  if (cloudEnabled()) {
    const root = await userRoot();
    const [own, shared] = await Promise.all([root.collection("folders").get(), collaborativeWorkspaces(true)]);
    const others = await Promise.all(shared.filter(space => space.ownerId !== root.id).map(async space => ({ ...(await services().db.collection("users").doc(space.ownerId).collection("folders").doc(space.id).get()).data(), collaborative: true, sharedRole: "coauthor", ownerId: space.ownerId })));
    return [...own.docs.map(doc => ({ ...doc.data(), ...(shared.some(space => space.id === doc.id) ? { collaborative: true, sharedRole: "owner", ownerId: root.id } : {}) })), ...others].map(folder => folder as ExamFolder).filter(folder => folder.id).sort((a, b) => a.name.localeCompare(b.name));
  }
  await mkdir(dataRoot(), { recursive: true });
  const files = (await readdir(dataRoot())).filter(f => /^folder-[0-9a-f-]+\.json$/.test(f));
  return Promise.all(files.map(async f => JSON.parse(await readFile(path.join(dataRoot(), f), "utf8"))));
}
export async function createFolder(name: string, examDate?: string, availability: StudyAvailability = {}, cfu?: number) {
  if (cfu !== undefined && !validExamCfu(cfu)) throw Object.assign(new Error("Indica CFU tra 0,5 e 120, a incrementi di 0,5."), { status: 400 });
  const existing = await listFolders();
  const profile = await getStudyProfile();
  const folder: ExamFolder = {
    provenance: { university: profile.university || "", studyProgram: profile.studyProgram, authorName: profile.displayName || "Studente" },
    id: randomUUID(), name, createdAt: new Date().toISOString(), color: examColors[existing.length % examColors.length],
    ...(examDate ? { examDate } : {}),
    ...(cfu !== undefined ? { cfu } : {}),
    ...(availability.nonStudyWeekdays !== undefined ? { nonStudyWeekdays: [...new Set(availability.nonStudyWeekdays)] } : {}),
    ...(availability.nonStudyDates !== undefined ? { nonStudyDates: [...new Set(availability.nonStudyDates)] } : {}),
  };
  if (cloudEnabled()) await (await userRoot()).collection("folders").doc(folder.id).set(folder);
  else { await mkdir(dataRoot(), { recursive: true }); await writeFile(path.join(dataRoot(), `folder-${folder.id}.json`), JSON.stringify(folder)); }
  return folder;
}

type FolderChanges = StudyAvailability & { archived?: boolean; optional?: boolean; name?: string; color?: ExamFolder["color"]; examDate?: string | null; pagesPerHour?: number; cfu?: number | null };
const folderQueues = new Map<string, Promise<unknown>>();
export async function updateFolder(id: string, changes: FolderChanges | ((folder: ExamFolder) => void)): Promise<ExamFolder> {
  if (typeof changes !== "function" && changes.optional !== undefined && typeof changes.optional !== "boolean") throw Object.assign(new Error("Indica se l’esame è facoltativo."), { status: 400 });
  if (typeof changes !== "function" && changes.cfu !== undefined && changes.cfu !== null && !validExamCfu(changes.cfu)) throw Object.assign(new Error("Indica CFU tra 0,5 e 120, a incrementi di 0,5."), { status: 400 });
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw Object.assign(new Error("Esame non valido."), { status: 400 });
  const apply = (folder: ExamFolder) => {
    if (typeof changes === "function") { changes(folder); return folder; }
    if (changes.name !== undefined) folder.name = changes.name;
    if (changes.archived !== undefined) folder.archived = changes.archived;
    if (changes.optional !== undefined) folder.optional = changes.optional;
    if (changes.color !== undefined) folder.color = changes.color;
    if (changes.examDate === null) delete folder.examDate;
    else if (changes.examDate !== undefined) folder.examDate = changes.examDate;
    if (changes.pagesPerHour !== undefined) folder.pagesPerHour = changes.pagesPerHour;
    if (changes.cfu === null) delete folder.cfu;
    else if (changes.cfu !== undefined) folder.cfu = changes.cfu;
    if (changes.nonStudyWeekdays !== undefined) folder.nonStudyWeekdays = [...new Set(changes.nonStudyWeekdays)];
    if (changes.nonStudyDates !== undefined) folder.nonStudyDates = [...new Set(changes.nonStudyDates)];
    return folder;
  };
  if (cloudEnabled()) {
    const ref = await folderReference(id);
    const result = await services().db.runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) throw Object.assign(new Error("Esame non trovato."), { status: 404 });
      const updated = apply(snapshot.data() as ExamFolder);
      tx.set(ref, updated);
      return updated;
    });
    courseContextCache.delete(ref.path);
    return result;
  }
  const previous = folderQueues.get(id) || Promise.resolve();
  const task = previous.catch(() => {}).then(async () => {
    const file = path.join(dataRoot(), `folder-${id}.json`);
    let folder: ExamFolder;
    try { folder = JSON.parse(await readFile(file, "utf8")); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") throw Object.assign(new Error("Esame non trovato."), { status: 404 }); throw error; }
    const updated = apply(folder);
    const temp = path.join(dataRoot(), `.folder-${randomUUID()}.tmp`);
    await writeFile(temp, JSON.stringify(updated));
    await rename(temp, file);
    return updated;
  });
  folderQueues.set(id, task);
  try { return await task; } finally { if (folderQueues.get(id) === task) folderQueues.delete(id); }
}

/** Keep a retry manifest until every PDF and its metadata have been removed. */
export async function deleteFolder(id: string): Promise<void> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw Object.assign(new Error("Esame non valido."), { status: 400 });
  type DeletingFolder = ExamFolder & { deletionDocumentIds?: string[] };
  const root = cloudEnabled() ? (await assertCourseOwner(id)).parent.parent! : null;
  const documents = root
    ? (await root.collection("documents").where("folderId", "==", id).get()).docs.map(doc => ({ id: doc.id }))
    : (await listDocuments()).filter(doc => doc.folderId === id);
  let pending: string[] = [];
  try {
    await updateFolder(id, folder => {
      const stored = folder as DeletingFolder;
      pending = [...new Set([...(stored.deletionDocumentIds || []), ...documents.map(doc => doc.id)])];
      stored.deletionDocumentIds = pending;
    });
  } catch (error) { if ((error as { status?: number }).status === 404) return; throw error; }
  await runParallelFiles(pending, 4, async documentId => {
    try { await deleteDocument(documentId); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  });
  if (root) { await services().db.collection("sharedWorkspaces").doc(id).delete();
    const imports = await root.collection("materialImports").where("folderId", "==", id).get();
    await Promise.all(imports.docs.map(doc => doc.ref.delete()));
    const publications = await services().db.collection("sharedMaterials").where("ownerId", "==", root.id).get();
    await Promise.all(publications.docs.filter(doc => doc.get("sourceId") === id).map(async doc => { await doc.ref.update({ active: false, visibility: "private" }); await services().db.collection("publicCourseFeeds").doc(publicFeedId(doc.get("provenance").studyProgram)).collection("courses").doc(doc.id).delete(); }));
    await root.collection("folders").doc(id).delete(); courseContextCache.delete(`${root.path}/folders/${id}`); }
  else await unlink(path.join(dataRoot(), `folder-${id}.json`)).catch(error => { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; });
}
