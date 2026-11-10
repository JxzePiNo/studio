import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { createDocument, readDocument, readPdf, updateDocument } from "../lib/store";
import { saveQuiz, findSavedQuiz } from "../lib/quiz-store";
import { explainQuizAnswer } from "../lib/quiz-explanation";
import { POST } from "../app/api/documents/[id]/quiz/[quizId]/explain/route";
import type { StudyQuiz } from "../lib/quiz";

test("wrong-answer explanations validate before paid calls, reuse durable cache, preserve quiz and document", async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "studio-quiz-explain-"));
  const previous = { data: process.env.DATA_DIR, enabled: process.env.NEXT_PUBLIC_FIREBASE_ENABLED, key: process.env.OPENAI_API_KEY, fetch: globalThis.fetch };
  process.env.DATA_DIR = directory; process.env.NEXT_PUBLIC_FIREBASE_ENABLED = "false"; process.env.OPENAI_API_KEY = "mock-only";
  t.after(async () => {
    globalThis.fetch = previous.fetch;
    for (const [key, value] of Object.entries({ DATA_DIR: previous.data, NEXT_PUBLIC_FIREBASE_ENABLED: previous.enabled, OPENAI_API_KEY: previous.key })) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await rm(directory, { recursive: true, force: true });
  });
  const pdf = await PDFDocument.create(); pdf.addPage();
  const bytes = await pdf.save();
  const document = await createDocument("Fisica.pdf", bytes, 1);
  const quiz: StudyQuiz = { id: "legacy-quiz", documentId: document.id, documentName: document.name, title: "Fisica", topics: [], createdAt: new Date().toISOString(), questions: [
    { type: "true-false", question: "Una forza cambia la quantita di moto?", topic: "Dinamica", page: 1, options: ["Vero", "Falso"], correctIndex: 0, explanation: "F = dp/dt.", modelAnswer: "" },
    { type: "open", question: "Spiega.", topic: "Dinamica", page: 1, options: [], correctIndex: null, explanation: "Riferimento.", modelAnswer: "Forza." },
  ] };
  await updateDocument(document.id, current => { current.slides[1] = { notes: "appunti", chat: [{ role: "assistant", content: "Quiz", quiz }] }; });
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    calls++;
    const body = JSON.parse(String(options?.body));
    assert.equal(body.store, false);
    assert.equal(JSON.parse(body.input[0].content[1].text).selectedAnswer, "Falso");
    return Response.json({ id: "explain", object: "response", status: "completed", output: [{ type: "message", id: "msg", role: "assistant", status: "completed", content: [{ type: "output_text", text: "## Il tuo errore\nLa forza cambia la quantita di moto: F = dp/dt. Pagina 1.", annotations: [] }] }] });
  };
  for (const [question, selected] of [[0, 0], [0, 2], [1, 0], [-1, 1], [0.5, 1]]) await assert.rejects(explainQuizAnswer(document.id, quiz.id, question, selected), { status: 400 });
  assert.equal(calls, 0);
  const denied = await POST(new Request("http://127.0.0.1/api", { method: "POST", headers: { origin: "https://evil.example" }, body: JSON.stringify({ questionIndex: 0, selectedIndex: 1 }) }), { params: Promise.resolve({ id: document.id, quizId: quiz.id }) });
  assert.equal(denied.status, 403);
  const [first, duplicate] = await Promise.all([explainQuizAnswer(document.id, quiz.id, 0, 1), explainQuizAnswer(document.id, quiz.id, 0, 1)]);
  assert.equal(first, duplicate); assert.equal(calls, 1);
  await saveQuiz(document.id, { ...quiz, title: "Rinominato" });
  delete process.env.OPENAI_API_KEY;
  assert.equal(await explainQuizAnswer(document.id, quiz.id, 0, 1), first);
  assert.equal(calls, 1);
  assert.equal((await findSavedQuiz(await readDocument(document.id), quiz.id)).title, "Rinominato");
  assert.equal((await readDocument(document.id)).slides[1].notes, "appunti");
  assert.deepEqual(Buffer.from(await readPdf(document.id)), Buffer.from(bytes));
});

