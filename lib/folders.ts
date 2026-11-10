import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { cloudEnabled, services, userRoot } from "./firebase-server";
import { dataRoot } from "./store";
import type { ExamFolder, StudyAvailability } from "./types";
import { examColors } from "./exam-colors";

export async function listFolders(): Promise<ExamFolder[]> {
  if (cloudEnabled()) return (await (await userRoot()).collection("folders").get()).docs.map(d => d.data() as ExamFolder).sort((a,b) => a.name.localeCompare(b.name));
  await mkdir(dataRoot(), { recursive: true });
  const files = (await readdir(dataRoot())).filter(f => /^folder-[0-9a-f-]+\.json$/.test(f));
  return Promise.all(files.map(async f => JSON.parse(await readFile(path.join(dataRoot(), f), "utf8"))));
}
export async function createFolder(name: string, examDate?: string, availability: StudyAvailability = {}) {
  const existing = await listFolders();
  const folder: ExamFolder = {
    id: randomUUID(), name, createdAt: new Date().toISOString(), color: examColors[existing.length % examColors.length],
    ...(examDate ? { examDate } : {}),
    ...(availability.nonStudyWeekdays !== undefined ? { nonStudyWeekdays: [...new Set(availability.nonStudyWeekdays)] } : {}),
    ...(availability.nonStudyDates !== undefined ? { nonStudyDates: [...new Set(availability.nonStudyDates)] } : {}),
  };
  if (cloudEnabled()) await (await userRoot()).collection("folders").doc(folder.id).set(folder);
  else { await mkdir(dataRoot(), { recursive: true }); await writeFile(path.join(dataRoot(), `folder-${folder.id}.json`), JSON.stringify(folder)); }
  return folder;
}

type FolderChanges = StudyAvailability & { name?: string; color?: ExamFolder["color"]; examDate?: string | null; pagesPerHour?: number };
const folderQueues = new Map<string, Promise<unknown>>();
export async function updateFolder(id: string, changes: FolderChanges | ((folder: ExamFolder) => void)): Promise<ExamFolder> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw Object.assign(new Error("Esame non valido."), { status: 400 });
  const apply = (folder: ExamFolder) => {
    if (typeof changes === "function") { changes(folder); return folder; }
    if (changes.name !== undefined) folder.name = changes.name;
    if (changes.color !== undefined) folder.color = changes.color;
    if (changes.examDate === null) delete folder.examDate;
    else if (changes.examDate !== undefined) folder.examDate = changes.examDate;
    if (changes.pagesPerHour !== undefined) folder.pagesPerHour = changes.pagesPerHour;
    if (changes.nonStudyWeekdays !== undefined) folder.nonStudyWeekdays = [...new Set(changes.nonStudyWeekdays)];
    if (changes.nonStudyDates !== undefined) folder.nonStudyDates = [...new Set(changes.nonStudyDates)];
    return folder;
  };
  if (cloudEnabled()) {
    const ref = (await userRoot()).collection("folders").doc(id);
    return services().db.runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) throw Object.assign(new Error("Esame non trovato."), { status: 404 });
      const updated = apply(snapshot.data() as ExamFolder);
      tx.set(ref, updated);
      return updated;
    });
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
