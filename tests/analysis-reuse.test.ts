import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { POST } from "../app/api/documents/[id]/analyze/route";
import { createDocument, readDocument, updateSlide } from "../lib/store";
import { saveStudyProfile } from "../lib/study-profile";

test("identical renamed PDFs reuse analysis across concurrent requests, preserving personal data and regeneration", async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "analysis-reuse-"));
  const previous = { fetch: globalThis.fetch, data: process.env.DATA_DIR, enabled: process.env.NEXT_PUBLIC_FIREBASE_ENABLED, key: process.env.OPENAI_API_KEY };
  process.env.DATA_DIR = directory; process.env.NEXT_PUBLIC_FIREBASE_ENABLED = "false"; process.env.OPENAI_API_KEY = "fake-no-network";
  t.after(async () => {
    globalThis.fetch = previous.fetch;
    for (const [key, value] of Object.entries({ DATA_DIR: previous.data, NEXT_PUBLIC_FIREBASE_ENABLED: previous.enabled, OPENAI_API_KEY: previous.key })) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await rm(directory, { recursive: true, force: true });
  });
  const pdf = await PDFDocument.create(); pdf.addPage(); const bytes = await pdf.save();
  const first = await createDocument("Privato-A.pdf", bytes, 1), second = await createDocument("Altro-nome.pdf", bytes, 1);
  await updateSlide(first.id, 1, slide => ({ ...slide, notes: "PRIVATE_NOTES", read: true, chat: [{ role: "user", content: "PRIVATE_CHAT" }] }));
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    const text = JSON.parse(String(init?.body)).input[0].content[1].text;
    assert.ok(!text.includes("PRIVATE_NOTES") && !text.includes("PRIVATE_CHAT") && !text.includes("Privato-A"));
    const explanation = { pageKind: "content", title: `Analisi ${calls}`, language: "it", overview: "Una spiegazione", concepts: [], glossary: [], example: "", takeaway: "" };
    return Response.json({ id: `response_${calls}`, status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify(explanation), annotations: [] }] }] });
  };
  const analyze = (id: string, regenerate = false) => POST(new Request(`http://localhost/api/documents/${id}/analyze`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page: 1, regenerate }) }), { params: Promise.resolve({ id }) });
  const results = await Promise.all([analyze(first.id), analyze(second.id)]);
  assert.ok(results.every(result => result.status === 200)); assert.equal(calls, 1);
  const saved = await readDocument(second.id);
  assert.equal(saved.slides[1].explanation?.pageKind, "content");
  assert.equal(saved.slides[1].notes, ""); assert.equal(saved.slides[1].chat, undefined); assert.equal(saved.slides[1].read, undefined);
  assert.equal((await readDocument(first.id)).slides[1].notes, "PRIVATE_NOTES");
  await analyze(second.id, true); assert.equal(calls, 2);
  assert.equal((await readDocument(first.id)).slides[1].explanation!.title, "Analisi 1");
  await saveStudyProfile({ studyProgram: "Fisica", onboardingCompleted: true });
  const third = await createDocument("Fisica.pdf", bytes, 1);
  assert.equal((await analyze(third.id)).status, 200); assert.equal(calls, 3, "a different teaching context gets its own explanation");
  delete process.env.OPENAI_API_KEY;
  const fourth = await createDocument("Stesso-contesto.pdf", bytes, 1);
  assert.equal(fourth.slides[1].explanation?.title, "Analisi 3", "an existing analysis is ready immediately on upload");
  assert.equal(fourth.slides[1].notes, "");
  assert.equal(fourth.slides[1].chat, undefined);
  assert.equal((await analyze(fourth.id)).status, 200); assert.equal(calls, 3, "a cache hit does not need another provider call");
});
