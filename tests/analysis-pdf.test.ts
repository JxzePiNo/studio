import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { extractAnalysisPage } from "../lib/analysis-pdf";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { POST } from "../app/api/documents/[id]/analyze/route";
import { createDocument, readDocument, updateDocument } from "../lib/store";

test("70 concurrent page extractions read one original, preserve page identity and release their source", async () => {
  const original = await PDFDocument.create();
  for (let index = 0; index < 700; index++) original.addPage([300 + index, 900]);
  const bytes = await original.save();
  let reads = 0;
  const read = async () => { reads++; return bytes; };
  const pages = await Promise.all(Array.from({ length: 70 }, (_, i) => extractAnalysisPage("owner:book", i * 10 + 1, read)));
  assert.equal(reads, 1);
  for (let index = 0; index < pages.length; index++) {
    const page = await PDFDocument.load(pages[index]);
    assert.equal(page.getPageCount(), 1); assert.equal(page.getPage(0).getWidth(), 300 + index * 10);
  }
  await extractAnalysisPage("owner:book", 1, read);
  assert.equal(reads, 2, "completed sources are released instead of retaining large documents");
  await Promise.all([extractAnalysisPage("owner:book", 1, read), extractAnalysisPage("another-owner:book", 1, read)]);
  assert.equal(reads, 4, "different authenticated sessions never share documents");
});

test("failed original reads are removed so retries can succeed", async () => {
  await assert.rejects(extractAnalysisPage("owner:retry", 1, async () => { throw new Error("Read failed"); }));
  const original = await PDFDocument.create(); original.addPage();
  const result = await extractAnalysisPage("owner:retry", 1, async () => original.save());
  assert.equal((await PDFDocument.load(result)).getPageCount(), 1);
});

test("70 parallel analysis API calls persist every page and preserve notes and read state", async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "studio-parallel-analysis-"));
  const previous = { fetch: globalThis.fetch, data: process.env.DATA_DIR, enabled: process.env.NEXT_PUBLIC_FIREBASE_ENABLED, key: process.env.OPENAI_API_KEY };
  process.env.DATA_DIR = directory; process.env.NEXT_PUBLIC_FIREBASE_ENABLED = "false"; process.env.OPENAI_API_KEY = "test-never-sent-to-network";
  t.after(async () => {
    globalThis.fetch = previous.fetch;
    for (const [key, value] of Object.entries({ DATA_DIR: previous.data, NEXT_PUBLIC_FIREBASE_ENABLED: previous.enabled, OPENAI_API_KEY: previous.key })) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await rm(directory, { recursive: true, force: true });
  });
  const original = await PDFDocument.create(); for (let index = 0; index < 700; index++) original.addPage();
  const document = await createDocument("Libro.pdf", await original.save(), 700);
  await updateDocument(document.id, doc => { doc.slides[1] = { notes: "Appunti personali", read: true }; });
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://api.openai.com/v1/responses"); calls++;
    const body = JSON.parse(String(init?.body));
    const file = body.input[0].content.find((item: { type: string }) => item.type === "input_file");
    assert.equal((await PDFDocument.load(Buffer.from(file.file_data.split(",")[1], "base64"))).getPageCount(), 1);
    const explanation = { pageKind: "content", title: "Pagina analizzata", language: "it", overview: "Concetto della pagina", concepts: [], example: "", takeaway: "", glossary: [] };
    return Response.json({ id: "test-analysis", object: "response", status: "completed", output: [{ id: "message", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(explanation), annotations: [] }] }] });
  };
  const pages = Array.from({ length: 70 }, (_, index) => index * 10 + 1);
  const responses = await Promise.all(pages.map(page => POST(new Request(`http://localhost/api/documents/${document.id}/analyze`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page }) }), { params: Promise.resolve({ id: document.id }) })));
  assert.ok(responses.every(response => response.status === 200)); assert.equal(calls, 70);
  const saved = await readDocument(document.id);
  for (const page of pages) assert.ok(saved.slides[page]?.explanation);
  assert.equal(Object.values(saved.slides).filter(slide => slide.explanation).length, 70);
  assert.equal(saved.slides[1].notes, "Appunti personali"); assert.equal(saved.slides[1].read, true);
});
