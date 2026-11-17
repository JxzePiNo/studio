import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { POST } from "../app/api/documents/[id]/chat/route";
import { createDocument, readDocument } from "../lib/store";
import { readChatStream, type ChatStreamEvent } from "../lib/chat-stream";

test("chat repairs formulas before saving or emitting and fails closed after bounded corrections", async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "studio-chat-math-"));
  const previous = { data: process.env.DATA_DIR, enabled: process.env.NEXT_PUBLIC_FIREBASE_ENABLED, key: process.env.OPENAI_API_KEY, fetch: globalThis.fetch };
  process.env.DATA_DIR = directory; process.env.NEXT_PUBLIC_FIREBASE_ENABLED = "false"; process.env.OPENAI_API_KEY = "fake-no-network";
  t.after(async () => {
    globalThis.fetch = previous.fetch;
    for (const [key, value] of Object.entries({ DATA_DIR: previous.data, NEXT_PUBLIC_FIREBASE_ENABLED: previous.enabled, OPENAI_API_KEY: previous.key })) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await rm(directory, { recursive: true, force: true });
  });
  const pdf = await PDFDocument.create(); pdf.addPage();
  const doc = await createDocument("Formule.pdf", await pdf.save(), 1);
  let calls = 0;
  let repairable = true;
  globalThis.fetch = async (_url, options) => {
    calls++;
    const body = JSON.parse(String(options?.body));
    const repair = body.text.format.name === "math_repair";
    if (repair) assert.match(JSON.parse(body.input).fields[0].issues.join(" "), /Undefined control sequence/);
    const value = repair ? { fields: [{ id: 0, markdown: repairable ? "La relazione corretta è $E=mc^2$." : String.raw`$\bad$` }] } : { verdict: "no", segments: [{ kind: "markdown", content: "La relazione corretta è " }, { kind: "inline_math", content: String.raw`\bad` }, { kind: "markdown", content: "." }] };
    const output = { id: "math", status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify(value), annotations: [] }] }] };
    if (!body.stream) return Response.json(output);
    const frame = (event: unknown) => `data: ${JSON.stringify(event)}\n\n`;
    return new Response(frame({ type: "response.output_text.delta", delta: "RAW_INVALID_LATEX" }) + frame({ type: "response.completed", response: output }), { headers: { "Content-Type": "text/event-stream" } });
  };
  const ask = (stream = false) => POST(new Request(`http://127.0.0.1/api/documents/${doc.id}/chat`, { method: "POST", headers: { "Content-Type": "application/json", ...(stream ? { Accept: "text/event-stream" } : {}) }, body: JSON.stringify({ page: 1, question: "È corretta questa relazione?", scope: "slide" }) }), { params: Promise.resolve({ id: doc.id }) });
  const success = await ask();
  assert.equal(success.status, 200);
  assert.equal(calls, 2);
  const messages = await success.json();
  assert.equal(messages.at(-1).content, "No.\n\nLa relazione corretta è $E=mc^2$.");
  assert.equal((await readDocument(doc.id)).slides[1].chat?.length, 2);

  repairable = false;
  const failure = await ask();
  assert.equal(failure.status, 502);
  assert.match((await failure.json()).error, /formule/);
  assert.equal(calls, 5, "one generation plus at most two corrections");
  const events: ChatStreamEvent[] = [];
  await assert.rejects(readChatStream(await ask(true), event => { events.push(event); }), /formule/);
  assert.deepEqual(events, [], "the decoder rejects the error without exposing text or completion");
  assert.equal((await readDocument(doc.id)).slides[1].chat?.length, 2, "failed answers are never persisted");

  repairable = true;
  const validEvents: ChatStreamEvent[] = [];
  await readChatStream(await ask(true), event => { validEvents.push(event); });
  assert.deepEqual(validEvents.map(event => event.event), ["done"]);
  assert.equal((await readDocument(doc.id)).slides[1].chat?.length, 4);
});
