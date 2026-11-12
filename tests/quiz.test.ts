import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { quickQuizConfig, quizConfigSchema, quizGenerationSchema, validateGeneratedQuiz } from "../lib/quiz";
import { POST } from "../app/api/documents/[id]/chat/route";
import { GET, POST as CREATE } from "../app/api/documents/[id]/quiz/route";
import { listSavedQuizzes } from "../lib/quiz-store";
import { createDocument, readDocument, updateDocument } from "../lib/store";
import { createFolder } from "../lib/folders";
import { generateQuiz } from "../lib/quiz-generation";

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
  assert.throws(() => validateGeneratedQuiz(generated, { ...config, throughPage: 1 }, 10));
  assert.equal(quizConfigSchema.safeParse({ ...config, throughPage: 0 }).success, false);
  assert.throws(() => validateGeneratedQuiz({ ...generated, questions: generated.questions.map((question, index) => index ? question : { ...question, options: ["A", "a", "B", "C"] }) }, config, 2));
});

test("quick quiz physically excludes later pages and rejects questions beyond the selected page", async t => {
  const previous = { fetch: globalThis.fetch, key: process.env.OPENAI_API_KEY, cloud: process.env.NEXT_PUBLIC_FIREBASE_ENABLED };
  process.env.OPENAI_API_KEY = "fake-no-network"; process.env.NEXT_PUBLIC_FIREBASE_ENABLED = "false";
  t.after(() => { globalThis.fetch = previous.fetch; if (previous.key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous.key; if (previous.cloud === undefined) delete process.env.NEXT_PUBLIC_FIREBASE_ENABLED; else process.env.NEXT_PUBLIC_FIREBASE_ENABLED = previous.cloud; });
  const pdf = await PDFDocument.create();
  pdf.addPage([300, 400]); pdf.addPage([400, 500]); pdf.addPage([500, 600]);
  const bytes = await pdf.save();
  const document = { id: "doc", name: "Lezione.pdf", pages: 3 } as Awaited<ReturnType<typeof createDocument>>;
  let calls = 0, badPage = false, recover = false, unauthorized = false;
  globalThis.fetch = async (_url, init) => {
    calls++;
    if (unauthorized) return Response.json({ error: { message: "Invalid key", type: "invalid_request_error" } }, { status: 401 });
    const body = JSON.parse(String(init?.body)), file = body.input[0].content.find((item: { type: string }) => item.type === "input_file");
    const attached = await PDFDocument.load(Buffer.from(file.file_data.split(",")[1], "base64"));
    assert.equal(attached.getPageCount(), 2);
    assert.equal(attached.getPage(0).getWidth(), 300); assert.equal(attached.getPage(1).getWidth(), 400);
    assert.ok(body.input[0].content[1].text.includes("da 1 a 2"));
    if (recover && calls === 6) { assert.match(body.instructions, /generazione precedente/); badPage = false; }
    const quiz = { title: "Ripasso fino a pagina 2", questions: Array.from({ length: 10 }, (_, index) => ({ ...generated.questions[0], question: `Domanda ${index + 1}`, page: badPage ? 3 : index % 2 + 1 })) };
    return Response.json({ id: "quick-quiz", object: "response", status: "completed", output: [{ id: "message-quiz", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(quiz), annotations: [] }] }] });
  };
  const result = await generateQuiz(document, bytes, quickQuizConfig(2), "Corso di esempio");
  assert.equal(result.questions.length, 10); assert.ok(result.questions.every(question => question.page <= 2));
  badPage = true;
  await assert.rejects(generateQuiz(document, bytes, quickQuizConfig(2), ""), /non.*completo|fuori dall'ambito/);
  assert.equal(calls, 4, "invalid content is attempted at most three times");
  recover = true;
  const recovered = await generateQuiz(document, bytes, quickQuizConfig(2), "");
  assert.ok(recovered.questions.every(question => question.page <= 2));
  assert.equal(calls, 6);
  await assert.rejects(generateQuiz(document, bytes, quickQuizConfig(4), ""), /pagina.*non.*valida/);
  assert.equal(calls, 6, "invalid page limits are rejected before paid requests");
  unauthorized = true;
  await assert.rejects(generateQuiz(document, bytes, quickQuizConfig(2), ""));
  assert.equal(calls, 7, "provider authentication errors must not be retried");
});

test("generation schema constrains count, question types, options and physical pages", () => {
  const schema = quizGenerationSchema({ ...config, count: 1, openCount: 0, trueFalseCount: 0 }, 2);
  const valid = { title: "Ripasso", questions: [generated.questions[0]] };
  assert.equal(schema.safeParse(valid).success, true);
  assert.equal(schema.safeParse({ ...valid, questions: [] }).success, false);
  assert.equal(schema.safeParse({ ...valid, questions: [generated.questions[1]] }).success, false);
  assert.equal(schema.safeParse({ ...valid, questions: [{ ...generated.questions[0], page: 3 }] }).success, false);
  assert.equal(schema.safeParse({ ...valid, questions: [{ ...generated.questions[0], options: ["A", "B"] }] }).success, false);
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
  let wrongMixOnce = false;
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
    const result = wrongMixOnce ? { ...generated, questions: [generated.questions[0], generated.questions[1], generated.questions[1]] } : invalid ? { ...generated, questions: [] } : generated;
    wrongMixOnce = false;
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
  wrongMixOnce = true;
  const beforeRepair = calls;
  const repaired = await ask(true);
  assert.equal(repaired.status, 201);
  assert.equal(calls - beforeRepair, 2, "a wrong mix is regenerated automatically");
  assert.equal((await listSavedQuizzes(await readDocument(document.id))).length, 3, "only the repaired quiz is persisted");
  invalid = true;
  const beforeFailure = calls;
  const failed = await ask(true); assert.equal(failed.status, 502);
  assert.equal(calls - beforeFailure, 3);
  assert.equal((await readDocument(document.id)).slides[1].chat?.length, 2);
  assert.equal((await listSavedQuizzes(await readDocument(document.id))).length, 3);
});
