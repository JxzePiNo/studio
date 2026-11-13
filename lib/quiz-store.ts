import { documentReference } from "./shared-access";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import { cloudEnabled, userRoot } from "./firebase-server";
import { documentDir, readDocument, readDocumentMetadata } from "./store";
import { markQuizIndex } from "./cloud-store";
import type { StudyDocument } from "./types";
import type { StudyQuiz, SavedQuizResult } from "./quiz";

type StoredQuiz = StudyQuiz | { id: string; deleted: true };

/** Listing child quizzes must not download every page of an analyzed PDF. */
export async function readQuizIndexDocument(id: string): Promise<StudyDocument> {
  const metadata = await readDocumentMetadata(id);
  if (cloudEnabled() && metadata.quizIndexVersion === 1) return { ...metadata, slides: {} };
  const document = await readDocument(id);
  if (!cloudEnabled()) return document;
  // Migrate legacy chat quizzes once. create() never overwrites edits/tombstones
  // written by another request while the migration was reading old chat data.
  const root = (await documentReference(id)).collection("quizzes");
  const legacy = new Map<string, StudyQuiz>();
  const raw = await root.parent!.collection("slides").get();
  for (const slide of raw.docs) for (const message of (slide.get("chat") || []) as import("./types").ChatMessage[]) if (message.quiz) legacy.set(message.quiz.id, message.quiz);
  for (const quiz of legacy.values()) {
    checkId(quiz.id);
    try { await root.doc(quiz.id).create(quiz); }
    catch (error) { if ((error as { code?: number }).code !== 6) throw error; }
  }
  await markQuizIndex(id);
  return { ...metadata, slides: {} };
}
function checkId(id: string) {
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(id)) throw Object.assign(new Error("Quiz non valido."), { status: 400 });
}
async function records(documentId: string): Promise<StoredQuiz[]> {
  if (cloudEnabled()) {
    const snapshot = await (await documentReference(documentId)).collection("quizzes").get();
    return snapshot.docs.map(item => item.data() as StoredQuiz);
  }
  const directory = path.join(documentDir(documentId), "quizzes");
  try {
    const files = await readdir(directory);
    return await Promise.all(files.filter(file => file.endsWith(".json")).map(async file => JSON.parse(await readFile(path.join(directory, file), "utf8")) as StoredQuiz));
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
}
export async function listSavedQuizzes(document: StudyDocument): Promise<StudyQuiz[]> {
  // Older quizzes were saved only in chat. Keep them available without migration.
  const quizzes = new Map<string, StoredQuiz>();
  for (const slide of Object.values(document.slides)) for (const message of slide.chat || []) if (message.quiz) quizzes.set(message.quiz.id, message.quiz);
  for (const quiz of await records(document.id)) quizzes.set(quiz.id, quiz);
  const saved = [...quizzes.values()].filter((quiz): quiz is StudyQuiz => !("deleted" in quiz)).map(quiz => ({ ...quiz, documentId: document.id, documentName: document.name })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (cloudEnabled()) {
    const root = await userRoot(), source = await documentReference(document.id);
    return Promise.all(saved.map(async quiz => {
      const personal = await root.collection("quizResults").doc(`${document.id}-${quiz.id}`).get();
      const { latestResult, ...withoutResult } = quiz;
      return { ...withoutResult, ...(personal.exists ? { latestResult: personal.data() as SavedQuizResult } : source.parent.parent!.id === root.id && latestResult ? { latestResult } : {}) };
    }));
  }
  return Promise.all(saved.map(async quiz => {
    try { const result = JSON.parse(await readFile(path.join(documentDir(document.id), "quiz-results", `${quiz.id}.json`), "utf8")) as SavedQuizResult; return { ...quiz, latestResult: result }; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return quiz; throw error; }
  }));
}
async function write(documentId: string, quiz: StoredQuiz) {
  checkId(quiz.id);
  if (cloudEnabled()) {
    const ref = await documentReference(documentId);
    if (!("deleted" in quiz) && quiz.latestResult) await (await userRoot()).collection("quizResults").doc(`${documentId}-${quiz.id}`).set(quiz.latestResult);
    const stored = { ...quiz };
    if (!("deleted" in stored)) delete stored.latestResult;
    await ref.collection("quizzes").doc(quiz.id).set(stored);
    return;
  }
  const directory = path.join(documentDir(documentId), "quizzes");
  await mkdir(directory, { recursive: true });
  const temporary = path.join(directory, `${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, JSON.stringify(quiz), "utf8");
    for (let attempt = 0; ; attempt++) {
      try { await rename(temporary, path.join(directory, `${quiz.id}.json`)); break; }
      catch (error) { if (!["EPERM", "EACCES", "EBUSY"].includes((error as NodeJS.ErrnoException).code || "") || attempt >= 7) throw error; await delay(25 * (attempt + 1)); }
    }
  } finally { await rm(temporary, { force: true }).catch(() => {}); }
}
export async function saveQuiz(documentId: string, quiz: StudyQuiz) {
  if (quiz.documentId !== documentId) throw Object.assign(new Error("Quiz non associato al PDF."), { status: 400 });
  await write(documentId, quiz);
}
export async function findSavedQuiz(document: StudyDocument, quizId: string) {
  checkId(quizId);
  const quiz = (await listSavedQuizzes(document)).find(item => item.id === quizId);
  if (!quiz) throw Object.assign(new Error("Quiz non trovato."), { status: 404 });
  return quiz;
}
export async function deleteSavedQuiz(documentId: string, quizId: string) {
  // A tombstone also hides legacy chat copies, so deletion survives reloads.
  await write(documentId, { id: quizId, deleted: true });
}

export async function saveQuizResult(documentId: string, quizId: string, result: SavedQuizResult) {
  checkId(quizId);
  if (cloudEnabled()) {
    await documentReference(documentId);
    await (await userRoot()).collection("quizResults").doc(`${documentId}-${quizId}`).set(result);
    return;
  }
  const directory = path.join(documentDir(documentId), "quiz-results");
  await mkdir(directory, { recursive: true });
  const temporary = path.join(directory, `${randomUUID()}.tmp`);
  try { await writeFile(temporary, JSON.stringify(result), "utf8"); await rename(temporary, path.join(directory, `${quizId}.json`)); }
  finally { await rm(temporary, { force: true }).catch(() => {}); }
}

// Separate artifacts keep explanations independent of quiz titles and legacy chat copies.
export async function readQuizExplanation(documentId: string, quizId: string, key: string): Promise<string | undefined> {
  checkId(quizId); checkId(key);
  if (cloudEnabled()) return (await (await documentReference(documentId)).collection("quizzes").doc(quizId).collection("explanations").doc(key).get()).data()?.explanation;
  try { return await readFile(path.join(documentDir(documentId), "quiz-explanations", quizId, `${key}.md`), "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
}
export async function saveQuizExplanation(documentId: string, quizId: string, key: string, explanation: string) {
  checkId(quizId); checkId(key);
  if (cloudEnabled()) {
    await (await documentReference(documentId)).collection("quizzes").doc(quizId).collection("explanations").doc(key).set({ explanation });
    return;
  }
  const directory = path.join(documentDir(documentId), "quiz-explanations", quizId);
  await mkdir(directory, { recursive: true });
  const temporary = path.join(directory, `${randomUUID()}.tmp`);
  try { await writeFile(temporary, explanation, "utf8"); await rename(temporary, path.join(directory, `${key}.md`)); }
  finally { await rm(temporary, { force: true }).catch(() => {}); }
}
