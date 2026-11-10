import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { cloudEnabled, userRoot } from "./firebase-server";
import { dataRoot } from "./store";
import { buildSavedSession, mergeSavedSessions, sessionIdsSchema, readingEventSchema, studyDateSchema, type ReadingEvent, type SavedSessionInput, type SavedStudySession, type StudyHistorySnapshot } from "./study-history";

type ReadingDay = { pages: string[]; importedCount?: number };
type StoredHistory = { sessions: SavedStudySession[]; days: Record<string, ReadingDay> };
const writes = new Map<string, Promise<unknown>>();
const empty = (): StoredHistory => ({ sessions: [], days: {} });
const destination = () => path.join(dataRoot(), "study-sessions.json");
async function localRead(): Promise<StoredHistory> {
  try {
    const value = JSON.parse(await readFile(destination(), "utf8"));
    if (!value || !Array.isArray(value.sessions) || !value.days || typeof value.days !== "object") throw new Error("Archivio delle sessioni non valido.");
    return value;
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return empty(); throw error; }
}
async function localUpdate(update: (history: StoredHistory) => void) {
  const file = destination();
  const task = (writes.get(file) || Promise.resolve()).catch(() => {}).then(async () => {
    const history = await localRead(); update(history);
    await mkdir(dataRoot(), { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(history), "utf8");
      for (let attempt = 0; ; attempt++) {
        try { await rename(temporary, file); break; }
        catch (error) { if (process.platform !== "win32" || !["EPERM", "EBUSY", "EACCES"].includes((error as NodeJS.ErrnoException).code || "") || attempt >= 7) throw error; await delay(25 * (attempt + 1)); }
      }
    } catch (error) { await rm(temporary, { force: true }).catch(() => {}); throw error; }
  });
  writes.set(file, task);
  try { await task; } finally { if (writes.get(file) === task) writes.delete(file); }
}
function applyReading(current: ReadingDay | undefined, events: ReadingEvent[]): ReadingDay {
  const pages = new Set(current?.pages || []);
  for (const event of events) { const key = `${event.documentId}:${event.page}`; if (event.read) pages.add(key); else pages.delete(key); }
  return { pages: [...pages], ...(current?.importedCount !== undefined ? { importedCount: current.importedCount } : {}) };
}
function snapshot(history: StoredHistory, day: string): StudyHistorySnapshot {
  return { sessions: [...history.sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 500), activity: Object.fromEntries(Object.entries(history.days).map(([date, entry]) => [date, Math.max(entry.pages.length, entry.importedCount || 0)])), todayPages: history.days[day]?.pages || [] };
}
export async function getStudyHistory(day: string): Promise<StudyHistorySnapshot> {
  studyDateSchema.parse(day);
  if (!cloudEnabled()) { await writes.get(destination())?.catch(() => {}); return snapshot(await localRead(), day); }
  const root = await userRoot();
  const [sessionDocs, dayDocs] = await Promise.all([root.collection("studySessions").orderBy("startedAt", "desc").limit(500).get(), root.collection("readingActivity").get()]);
  return snapshot({ sessions: sessionDocs.docs.map(doc => doc.data() as SavedStudySession), days: Object.fromEntries(dayDocs.docs.map(doc => [doc.id, doc.data() as ReadingDay])) }, day);
}
export async function recordReadingBatch(input: ReadingEvent[]): Promise<void> {
  const events = input.map(event => readingEventSchema.parse(event));
  const groups = new Map<string, ReadingEvent[]>();
  for (const event of events) groups.set(event.day, [...groups.get(event.day) || [], event]);
  if (!cloudEnabled()) { await localUpdate(history => { for (const [day, group] of groups) history.days[day] = applyReading(history.days[day], group); }); return; }
  const root = await userRoot();
  // Read before writing and group days to avoid a network round trip per date.
  const entries = [...groups];
  for (let offset = 0; offset < entries.length; offset += 200) {
    const chunk = entries.slice(offset, offset + 200);
    const refs = chunk.map(([day]) => root.collection("readingActivity").doc(day));
    await root.firestore.runTransaction(async transaction => {
      const snapshots = await transaction.getAll(...refs);
      snapshots.forEach((current, index) => transaction.set(refs[index], applyReading(current.exists ? current.data() as ReadingDay : undefined, chunk[index][1])));
    });
  }
}
export async function saveStudySession(input: SavedSessionInput): Promise<void> {
  const session = buildSavedSession(input);
  if (!cloudEnabled()) { await localUpdate(history => { if (!history.sessions.some(item => item.id === session.id)) history.sessions.push(session); }); return; }
  const ref = (await userRoot()).collection("studySessions").doc(session.id);
  await ref.firestore.runTransaction(async transaction => { if (!(await transaction.get(ref)).exists) transaction.set(ref, session); });
}
export async function mutateStudySessions(ids: string[], action: "delete" | "merge"): Promise<void> {
  const uniqueIds = [...new Set(sessionIdsSchema.parse({ ids }).ids)];
  if (action === "merge" && uniqueIds.length > 499) throw Object.assign(new Error("Raggruppa al massimo 499 sessioni alla volta."), { status: 400 });
  const mergedId = randomUUID();
  const apply = (sessions: SavedStudySession[]) => {
    const selected = sessions.filter(session => uniqueIds.includes(session.id));
    if (action === "merge" && selected.length !== uniqueIds.length) throw Object.assign(new Error("Le sessioni sono cambiate. Aggiorna e riprova."), { status: 409 });
    return action === "merge" ? mergeSavedSessions(selected, mergedId) : null;
  };
  if (!cloudEnabled()) { await localUpdate(history => { const merged = apply(history.sessions); history.sessions = history.sessions.filter(session => !uniqueIds.includes(session.id)); if (merged) history.sessions.push(merged); }); return; }
  const root = await userRoot();
  const refs = uniqueIds.map(id => root.collection("studySessions").doc(id));
  await root.firestore.runTransaction(async transaction => {
    const docs = await transaction.getAll(...refs);
    const merged = apply(docs.filter(doc => doc.exists).map(doc => doc.data() as SavedStudySession));
    for (const ref of refs) transaction.delete(ref);
    if (merged) transaction.set(root.collection("studySessions").doc(merged.id), merged);
  });
}
export async function importReadingActivity(activity: Record<string, number>): Promise<void> {
  const entries = Object.entries(activity);
  if (entries.length > 3660) throw Object.assign(new Error("Troppi giorni da importare."), { status: 400 });
  for (const [day, count] of entries) { studyDateSchema.parse(day); if (!Number.isSafeInteger(count) || count < 0 || count > 1000000) throw Object.assign(new Error("Conteggio non valido."), { status: 400 }); }
  if (!cloudEnabled()) { await localUpdate(history => { for (const [day, count] of entries) if (!history.days[day]) history.days[day] = { pages: [], importedCount: count }; }); return; }
  const root = await userRoot();
  for (const [day, count] of entries) {
    const ref = root.collection("readingActivity").doc(day);
    await ref.firestore.runTransaction(async transaction => { if (!(await transaction.get(ref)).exists) transaction.set(ref, { pages: [], importedCount: count }); });
  }
}
