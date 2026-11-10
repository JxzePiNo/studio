import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createDocument, readDocument, updateDocument } from "../lib/store";
import { listSavedQuizzes, saveQuiz } from "../lib/quiz-store";
import { GET, PATCH, DELETE } from "../app/api/documents/[id]/quiz/[quizId]/route";
import type { StudyQuiz } from "../lib/quiz";

test("quiz children persist beyond chat, migrate legacy copies and support rename/delete without changing the PDF", async t => {
  const previous = { root: process.env.DATA_DIR, cloud: process.env.NEXT_PUBLIC_FIREBASE_ENABLED };
  const directory = await mkdtemp(path.join(os.tmpdir(), "studio-quiz-library-"));
  process.env.DATA_DIR = directory; process.env.NEXT_PUBLIC_FIREBASE_ENABLED = "false";
  t.after(async () => {
    if (previous.root === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = previous.root;
    if (previous.cloud === undefined) delete process.env.NEXT_PUBLIC_FIREBASE_ENABLED; else process.env.NEXT_PUBLIC_FIREBASE_ENABLED = previous.cloud;
    await rm(directory, { recursive: true, force: true });
  });
  const doc = await createDocument("Originale.pdf", new Uint8Array([1, 2]), 2);
  const quiz: StudyQuiz = { id: randomUUID(), documentId: doc.id, documentName: doc.name, createdAt: new Date().toISOString(), topics: [], title: "Quiz originale", questions: [] };
  await saveQuiz(doc.id, quiz);
  assert.equal((await listSavedQuizzes(await readDocument(doc.id)))[0].title, quiz.title);
  const legacy = { ...quiz, id: randomUUID(), title: "Quiz dalla chat" };
  await updateDocument(doc.id, current => { current.slides[1] = { notes: "Appunti", read: true, chat: [{ role: "assistant", content: "Quiz pronto", quiz: legacy }] }; });
  assert.equal((await listSavedQuizzes(await readDocument(doc.id))).length, 2);
  const params = { params: Promise.resolve({ id: doc.id, quizId: legacy.id }) };
  const url = `http://127.0.0.1/api/documents/${doc.id}/quiz/${legacy.id}`;
  const renamed = await PATCH(new Request(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "  Ripasso finale  " }) }), params);
  assert.equal(renamed.status, 200);
  assert.equal((await renamed.json()).title, "Ripasso finale");
  assert.equal((await readDocument(doc.id)).slides[1].chat?.[0].quiz?.title, "Ripasso finale");
  await updateDocument(doc.id, current => { current.slides[1].chat = []; });
  assert.equal((await GET(new Request(url), params)).status, 200);
  const invalid = await PATCH(new Request(url, { method: "PATCH", body: JSON.stringify({ title: " " }) }), params);
  assert.equal(invalid.status, 400);
  assert.equal((await DELETE(new Request(url, { method: "DELETE" }), params)).status, 200);
  assert.equal((await GET(new Request(url), params)).status, 404);
  // Even an old chat copy cannot make an explicitly deleted child reappear.
  await updateDocument(doc.id, current => { current.slides[1].chat = [{ role: "assistant", content: "Old copy", quiz: legacy }]; });
  assert.deepEqual((await listSavedQuizzes(await readDocument(doc.id))).map(item => item.id), [quiz.id]);
  const unchanged = await readDocument(doc.id);
  assert.equal(unchanged.name, "Originale.pdf");
  assert.equal(unchanged.pages, 2);
  assert.equal(unchanged.slides[1].notes, "Appunti");
  assert.equal(unchanged.slides[1].read, true);
  await assert.rejects(saveQuiz(doc.id, { ...quiz, id: "../../escape" }), /Quiz non valido/);
});
