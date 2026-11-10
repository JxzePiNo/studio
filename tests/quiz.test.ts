import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { quizConfigSchema, validateGeneratedQuiz } from "../lib/quiz";
import { POST } from "../app/api/documents/[id]/chat/route";
import { GET, POST as CREATE } from "../app/api/documents/[id]/quiz/route";
import { listSavedQuizzes } from "../lib/quiz-store";
import { createDocument, readDocument, updateDocument } from "../lib/store";
import { createFolder } from "../lib/folders";

const config = quizConfigSchema.parse({ count: 3, openCount: 1, trueFalseCount: 1, topics: ["Entropia"] });
const generated = { title: "Ripasso di entropia", questions: [
  { type: "multiple-choice", question: "Quale misura l'entropia?", topic: "Entropia", page: 1, options: ["Disordine statistico", "Massa", "Velocità", "Forza"], correctIndex: 0, modelAnswer: "", explanation: "Descrive il numero di stati accessibili." },
  { type: "open", question: "Spiega l'entropia.", topic: "Entropia", page: 2, options: [], correctIndex: null, modelAnswer: "Una misura dei microstati accessibili.", explanation: "Bisogna distinguere macro e microstati." },
  { type: "true-false", question: "L'entropia dipende dagli stati accessibili.", topic: "Entropia", page: 2, options: ["Vero", "Falso"], correctIndex: 0, modelAnswer: "", explanation: "La relazione lega entropia e microstati." },
] };

test("quiz validates requested mix, distinct answers and actual PDF page references", () => {
  assert.equal(quizConfigSchema.safeParse({ count: 3, openCount: 3, trueFalseCount: 1, topics: [] }).success, false);
  assert.equal(quizConfigSchema.safeParse({ count: 31, openCount: 0, trueFalseCount: 0, topics: [] }).success, false);
  assert.equal(validateGeneratedQuiz(generated, config, 2).questions.length, 3);
  assert.throws(() => validateGeneratedQuiz(generated, { ...config, count: 4 }, 2));
  assert.throws(() => validateGeneratedQuiz(generated, config, 1));
  assert.throws(() => validateGeneratedQuiz({ ...generated, questions: generated.questions.map((question, index) => index ? question : { ...question, options: ["A", "a", "B", "C"] }) }, config, 2));
});

test("modal and natural chat requests generate the same persisted quiz using the complete PDF", async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "studio-quiz-"));
  const previous = { data: process.env.DATA_DIR, enabled: process.env.NEXT_PUBLIC_FIREBASE_ENABLED, key: process.env.OPENAI_API_KEY, fetch: globalThis.fetch };
  process.env.DATA_DIR = directory; process.env.NEXT_PUBLIC_FIREBASE_ENABLED = "false"; process.env.OPENAI_API_KEY = "fake-key-no-network";
  t.after(async () => {
    globalThis.fetch = previous.fetch;
    for (const [key, value] of Object.entries({ DATA_DIR: previous.data, NEXT_PUBLIC_FIREBASE_ENABLED: previous.enabled, OPENAI_API_KEY: previous.key })) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await rm(directory, { recursive: true, force: true });
  });
  const folder = await createFolder("Termodinamica");
  const pdf = await PDFDocument.create(); pdf.addPage(); pdf.addPage();
  const document = await createDocument("Entropia.pdf", await pdf.save(), 2, folder.id);
  await updateDocument(document.id, current => { current.slides[1] = { notes: "Conserva gli appunti.", explanation: { title: "Entropia", overview: "Introduzione", concepts: [{ title: "Microstati", explanation: "Gli stati del sistema." }], example: "Gas.", takeaway: "Gli stati accessibili.", language: "it", glossary: [] } }; });
  const params = { params: Promise.resolve({ id: document.id }) };
  const topics = await (await GET(new Request(`http://127.0.0.1/api/documents/${document.id}/quiz`), params)).json();
  assert.deepEqual(topics.topics, ["Entropia", "Microstati"]);
  let calls = 0;
  let invalid = false;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(String(url), "https://api.openai.com/v1/responses");
    const body = JSON.parse(String(options?.body));
    assert.equal(body.store, false);
    if (body.tools) return Response.json({ id: "tool_response", object: "response", status: "completed", output: [{ type: "function_call", name: "create_quiz", arguments: JSON.stringify(config), call_id: "quiz-call", id: "quiz-tool" }] });
    const file = body.input[0].content.find((part: { type: string }) => part.type === "input_file");
    assert.equal((await PDFDocument.load(Buffer.from(file.file_data.split(",")[1], "base64"))).getPageCount(), 2);
    assert.equal(body.text.format.name, "study_quiz");
    assert.ok(body.input[0].content[1].text.includes("Entropia"));
    const result = invalid ? { ...generated, questions: [] } : generated;
    return Response.json({ id: "quiz_response", object: "response", status: "completed", output: [{ type: "message", role: "assistant", id: "quiz_message", status: "completed", content: [{ type: "output_text", text: JSON.stringify(result), annotations: [] }] }] });
  };
  async function ask(explicit: boolean) {
    if (explicit) return CREATE(new Request(`http://127.0.0.1/api/documents/${document.id}/quiz`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) }), params);
    return POST(new Request(`http://127.0.0.1/api/documents/${document.id}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page: 1, scope: "slide", question: "Fammi un quiz di tre domande miste sull'entropia", ...(explicit ? { quiz: config } : {}) }) }), params);
  }
  const first = await ask(true); assert.equal(first.status, 201);
  assert.equal((await first.json()).questions.length, 3);
  assert.equal((await readDocument(document.id)).slides[1].chat, undefined);
  assert.equal(calls, 1);
  const second = await ask(false); assert.equal(second.status, 200);
  assert.ok(second.headers.get("X-Studio-Quiz-Id"));
  assert.equal((await second.json()).at(-1).quiz, undefined);
  assert.equal(calls, 3);
  const stored = await readDocument(document.id);
  assert.equal(stored.slides[1].notes, "Conserva gli appunti.");
  assert.equal(stored.slides[1].chat?.length, 2);
  assert.equal((await listSavedQuizzes(stored)).length, 2);
  invalid = true;
  const failed = await ask(true); assert.equal(failed.status, 502);
  assert.equal((await readDocument(document.id)).slides[1].chat?.length, 2);
  assert.equal((await listSavedQuizzes(await readDocument(document.id))).length, 2);
});
