import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { POST } from "../app/api/documents/[id]/chat/route";
import { createDocument, readDocument, updateDocument } from "../lib/store";
import { createFolder } from "../lib/folders";
import { saveStudyProfile } from "../lib/study-profile";
import type { Explanation } from "../lib/types";

test("chat uses the current study profile and analysis as its opening context without persisting duplicates", async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "studio-chat-context-"));
  const previous = { data: process.env.DATA_DIR, enabled: process.env.NEXT_PUBLIC_FIREBASE_ENABLED, key: process.env.OPENAI_API_KEY, fetch: globalThis.fetch };
  process.env.DATA_DIR = directory; process.env.NEXT_PUBLIC_FIREBASE_ENABLED = "false"; process.env.OPENAI_API_KEY = "fake-key-no-network";
  t.after(async () => {
    globalThis.fetch = previous.fetch;
    for (const [key, value] of Object.entries({ DATA_DIR: previous.data, NEXT_PUBLIC_FIREBASE_ENABLED: previous.enabled, OPENAI_API_KEY: previous.key })) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await rm(directory, { recursive: true, force: true });
  });
  const folder = await createFolder("Meccanica statistica");
  const pdf = await PDFDocument.create(); pdf.addPage(); pdf.addPage(); pdf.addPage(); pdf.addPage();
  const doc = await createDocument("Lezione 1.pdf", await pdf.save(), 4, folder.id);
  const explanation: Explanation = { title: "Entropia", language: "it", overview: "Una spiegazione iniziale completa della slide.", concepts: [{ title: "Ipotesi", explanation: "Un sistema in equilibrio." }], example: "Un esempio svolto.", takeaway: "L’entropia caratterizza gli stati accessibili.", glossary: [] };
  await updateDocument(doc.id, d => { d.slides[1] = { notes: "Un appunto personale.", explanation }; });
  const other = await createDocument("Lezione precedente.pdf", await pdf.save(), 4, folder.id);
  await updateDocument(other.id, d => { d.slides[1] = { notes: "", chat: [{ role: "user", content: "Ricordati il mio dubbio sulla pressione osmotica" }, { role: "assistant", content: "Abbiamo discusso la pressione osmotica." }] }; });
  let expectedProgram = "Laurea magistrale in fisica";
  let calls = 0;
  let checkMemory = false;
  let expectedPages = 1;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(String(url), "https://api.openai.com/v1/responses");
    const body = JSON.parse(String(options?.body));
    assert.equal(body.store, false); assert.equal(body.max_output_tokens, 7000);
    assert.match(body.instructions, /laurea magistrale/);
    const text = body.input[0].content.find((part: { type: string }) => part.type === "input_text").text;
    assert.ok(text.includes("Ricordati il mio dubbio sulla pressione osmotica"));
    assert.ok(text.includes("Lezione precedente.pdf"));
    const file = body.input[0].content.find((part: { type: string }) => part.type === "input_file");
    const attachedPdf = await PDFDocument.load(Buffer.from(file.file_data.split(",")[1], "base64"));
    assert.equal(attachedPdf.getPageCount(), expectedPages);
    for (const content of [expectedProgram, folder.name, explanation.overview, explanation.example, "Un appunto personale."]) assert.ok(text.includes(content));
    if (checkMemory) {
      assert.ok(text.includes("Come funziona l'equilibrio?"));
      assert.ok(text.includes("Concetto gi? letto"));
      assert.ok(!text.includes("Argomento futuro non letto"));
      assert.match(text, /Pagine originali allegate, in ordine: 2, 3/);
      assert.ok(body.instructions.includes("esposizione, non padronanza"));
    }
    return Response.json({ id: `response_${calls}`, object: "response", status: "completed", output: [{ id: `message_${calls}`, type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: "Un approfondimento tecnico con ipotesi e derivazione.", annotations: [] }] }] });
  };
  async function ask(scope = "slide", page = 1) {
    const response = await POST(new Request(`http://127.0.0.1/api/documents/${doc.id}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page, question: "Approfondisci la derivazione.", scope }) }), { params: Promise.resolve({ id: doc.id }) });
    assert.equal(response.status, 200); return response.json();
  }
  await saveStudyProfile({ studyProgram: expectedProgram, onboardingCompleted: true });
  const first = await ask(); assert.equal(first.length, 2);
  expectedProgram = "Laurea magistrale in matematica";
  await saveStudyProfile({ studyProgram: expectedProgram, onboardingCompleted: true });
  const second = await ask(); assert.equal(second.length, 4);
  expectedPages = 4;
  const full = await ask("document"); assert.equal(full.length, 6);
  const stored = await readDocument(doc.id);
  assert.deepEqual(stored.slides[1].explanation, explanation);
  assert.ok(stored.slides[1].chat?.every(message => message.source !== "analysis"));
  await updateDocument(doc.id, d => {
    d.slides[2] = { read: true, notes: "Concetto gi? letto", chat: [{ role: "user", content: "Come funziona l'equilibrio?" }, { role: "assistant", content: "Una spiegazione precedente." }] };
    d.slides[3] = { notes: "Un appunto personale.", explanation };
    d.slides[4] = { notes: "Argomento futuro non letto", explanation: { ...explanation, title: "Argomento futuro non letto" } };
  });
  expectedPages = 2;
  checkMemory = true;
  await ask("slide", 3);
  assert.equal(calls, 4);
});
