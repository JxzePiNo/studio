import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { POST } from "../app/api/documents/[id]/chat/route";
import { createDocument, readDocument } from "../lib/store";
import { readChatStream, type ChatStreamEvent } from "../lib/chat-stream";

const frame = (event: unknown) => new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);

test("chat streams actual deltas before completion, persists once, and reports interrupted output", async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "studio-chat-stream-"));
  const previous = { data: process.env.DATA_DIR, enabled: process.env.NEXT_PUBLIC_FIREBASE_ENABLED, key: process.env.OPENAI_API_KEY, fetch: globalThis.fetch };
  process.env.DATA_DIR = directory; process.env.NEXT_PUBLIC_FIREBASE_ENABLED = "false"; process.env.OPENAI_API_KEY = "fake-key-no-network";
  t.after(async () => {
    globalThis.fetch = previous.fetch;
    for (const [key, value] of Object.entries({ DATA_DIR: previous.data, NEXT_PUBLIC_FIREBASE_ENABLED: previous.enabled, OPENAI_API_KEY: previous.key })) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await rm(directory, { recursive: true, force: true });
  });
  const pdf = await PDFDocument.create(); pdf.addPage();
  const doc = await createDocument("Streaming.pdf", await pdf.save(), 1);
  let upstream!: ReadableStreamDefaultController<Uint8Array>;
  let ready!: () => void;
  let upstreamReady = new Promise<void>(resolve => { ready = resolve; });
  globalThis.fetch = async (_url, options) => {
    assert.equal(JSON.parse(String(options?.body)).stream, true);
    return new Response(new ReadableStream<Uint8Array>({ start(controller) { upstream = controller; ready(); } }), { headers: { "Content-Type": "text/event-stream" } });
  };
  const ask = () => POST(new Request(`http://127.0.0.1/api/documents/${doc.id}/chat`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "text/event-stream" }, body: JSON.stringify({ page: 1, question: "Spiega", scope: "slide" }) }), { params: Promise.resolve({ id: doc.id }) });
  const response = await ask();
  await upstreamReady;
  const events: ChatStreamEvent[] = [];
  let first!: () => void;
  const firstDelta = new Promise<void>(resolve => { first = resolve; });
  const reading = readChatStream(response, event => { events.push(event); if (event.event === "delta") first(); });
  upstream.enqueue(frame({ type: "response.output_text.delta", delta: "Una spiegazione " }));
  await firstDelta;
  assert.equal(events.length, 1);
  assert.equal((await readDocument(doc.id)).slides[1]?.chat, undefined);
  upstream.enqueue(frame({ type: "response.output_text.delta", delta: "completa." }));
  upstream.enqueue(frame({ type: "response.completed", response: { id: "response_1", status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "Una spiegazione completa.", annotations: [] }] }] } }));
  upstream.close();
  await reading;
  const stored = (await readDocument(doc.id)).slides[1].chat!;
  assert.equal(stored.length, 2); assert.equal(stored[1].content, "Una spiegazione completa.");
  assert.deepEqual(events.at(-1), { event: "done", data: { messages: stored } });

  upstreamReady = new Promise<void>(resolve => { ready = resolve; });
  const failure = await ask();
  await upstreamReady;
  const failedEvents: ChatStreamEvent[] = [];
  const failedReading = readChatStream(failure, event => failedEvents.push(event));
  upstream.enqueue(frame({ type: "response.output_text.delta", delta: "Parziale" }));
  upstream.enqueue(frame({ type: "response.incomplete", response: { status: "incomplete" } })); upstream.close();
  await assert.rejects(failedReading);
  assert.ok(failedEvents.some(event => event.event === "delta"));
  assert.ok(!failedEvents.some(event => event.event === "done"));
  assert.deepEqual((await readDocument(doc.id)).slides[1].chat, stored);

  let generate!: () => void;
  const generationGate = new Promise<void>(resolve => { generate = resolve; });
  const configuration = { count: 1, openCount: 1, trueFalseCount: 0, topics: [], difficulty: "intermedia" };
  const tool = { type: "function_call", name: "create_quiz", id: "tool_1", call_id: "call_1", arguments: JSON.stringify(configuration) };
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(String(options?.body));
    if (body.stream) return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(frame({ type: "response.output_item.added", item: tool }));
      controller.enqueue(frame({ type: "response.completed", response: { id: "quiz_response", status: "completed", output: [tool] } }));
      controller.close();
    } }), { headers: { "Content-Type": "text/event-stream" } });
    await generationGate;
    return Response.json({ id: "generated_quiz", status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify({ title: "Quiz di prova", questions: [{ type: "open", question: "Spiega il concetto", topic: "Concetto", page: 1, options: [], correctIndex: null, modelAnswer: "Risposta", explanation: "Spiegazione" }] }), annotations: [] }] }] });
  };
  const quizResponse = await ask();
  const quizEvents: ChatStreamEvent[] = [];
  let started!: () => void;
  const quizStarted = new Promise<void>(resolve => { started = resolve; });
  const quizReading = readChatStream(quizResponse, event => { quizEvents.push(event); if (event.event === "quiz-start") started(); });
  await quizStarted;
  assert.deepEqual(quizEvents.map(event => event.event), ["quiz-start"]);
  generate();
  await quizReading;
  assert.deepEqual(quizEvents.map(event => event.event), ["quiz-start", "quiz", "done"]);
  const done = quizEvents.at(-1);
  assert.ok(done?.event === "done" && done.data.quizId);
  assert.equal((await readDocument(doc.id)).slides[1].chat?.length, 4);

});

test("SSE decoder handles split UTF-8, CRLF frames and refuses premature EOF", async () => {
  const encoded = new TextEncoder().encode('event: delta\r\ndata: {"text":"è"}\r\n\r\nevent: done\r\ndata: {"messages":[]}\r\n\r\n');
  const events: ChatStreamEvent[] = [];
  await readChatStream(new Response(new ReadableStream({ start(controller) { for (const byte of encoded) controller.enqueue(new Uint8Array([byte])); controller.close(); } })), event => events.push(event));
  assert.deepEqual(events[0], { event: "delta", data: { text: "è" } });
  await assert.rejects(readChatStream(new Response('event: delta\ndata: {"text":"partial"}\n\n'), () => {}), /interrotta/);
});
