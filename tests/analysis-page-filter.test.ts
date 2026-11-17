import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { filterAnalysisPage } from "../lib/analysis-page-filter";
import { analysisExplanationSchema } from "../lib/schema";
import { introductoryPageKind, pageKindLabels } from "../lib/page-kind";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { POST } from "../app/api/documents/[id]/analyze/route";
import { createDocument, readDocument, updateSlide } from "../lib/store";

test("local filter recognizes blank pages, large titles and numbered indexes", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  const title = pdf.addPage();
  title.drawText("Termodinamica", { x: 50, y: 700, size: 32 });
  title.drawText("2", { x: 50, y: 20, size: 10 });
  const index = pdf.addPage();
  ["Indice", "Introduzione ........ 3", "Energia ........ 12", "Entropia ........ 24"].forEach((text, i) => index.drawText(text, { x: 50, y: 700 - i * 30, size: 14 }));
  for (const [i, kind] of ["blank", "title", "index"].entries()) {
    const single = await PDFDocument.create();
    const [page] = await single.copyPages(pdf, [i]); single.addPage(page);
    const result = await filterAnalysisPage(await single.save());
    assert.equal(result?.pageKind, kind);
    assert.ok(analysisExplanationSchema.safeParse(result).success);
    assert.equal(introductoryPageKind(result!), kind);
    assert.ok(pageKindLabels[kind as keyof typeof pageKindLabels]);
    assert.deepEqual(result?.concepts, []);
  }
});

test("uncertain pages, formulas, drawings, scans and malformed PDFs reach normal analysis", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText("Una definizione breve ma importante.", { size: 12 });
  pdf.addPage().drawText("E = mc2", { size: 32 });
  const number = pdf.addPage(); number.drawText("Misura", { size: 32, y: 700 }); number.drawText("42", { size: 32, y: 650 });
  const drawing = pdf.addPage();
  drawing.drawText("Titolo", { size: 32 }); drawing.drawLine({ start: { x: 10, y: 10 }, end: { x: 100, y: 100 } });
  const image = await pdf.embedPng(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=", "base64"));
  const scan = pdf.addPage();
  scan.drawImage(image, { x: 0, y: 0, width: 100, height: 100 });
  scan.drawLine({ start: { x: 10, y: 10 }, end: { x: 100, y: 100 } });
  const indexWithContent = pdf.addPage();
  ["Indice", "Questo paragrafo contiene una spiegazione.", "Argomento ........ 3"].forEach((text, i) => indexWithContent.drawText(text, { x: 20, y: 700 - i * 30, size: 14 }));
  for (let i = 0; i < pdf.getPageCount(); i++) {
    const single = await PDFDocument.create(); const [page] = await single.copyPages(pdf, [i]); single.addPage(page);
    assert.equal(await filterAnalysisPage(await single.save()), undefined, `page ${i + 1}`);
  }
  assert.equal(await filterAnalysisPage(new Uint8Array([1, 2, 3])), undefined);
});

test("analysis endpoint skips provider calls without a key, persists results and lets regeneration override", async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "analysis-filter-"));
  const previous = { DATA_DIR: process.env.DATA_DIR, NEXT_PUBLIC_FIREBASE_ENABLED: process.env.NEXT_PUBLIC_FIREBASE_ENABLED, OPENAI_API_KEY: process.env.OPENAI_API_KEY };
  const previousFetch = globalThis.fetch;
  process.env.DATA_DIR = directory; process.env.NEXT_PUBLIC_FIREBASE_ENABLED = "false"; delete process.env.OPENAI_API_KEY;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("Unexpected network request"); };
  t.after(async () => {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await rm(directory, { recursive: true, force: true });
  });
  const pdf = await PDFDocument.create(); pdf.addPage();
  const document = await createDocument("Vuoto.pdf", await pdf.save(), 1);
  await updateSlide(document.id, 1, slide => ({ ...slide, notes: "Appunti", read: true }));
  const analyze = (regenerate = false) => POST(new Request(`http://localhost/api/documents/${document.id}/analyze`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page: 1, regenerate }),
  }), { params: Promise.resolve({ id: document.id }) });
  assert.equal((await analyze()).status, 200);
  assert.equal((await analyze()).status, 200);
  assert.equal(calls, 0);
  const saved = await readDocument(document.id);
  assert.equal(saved.slides[1].explanation?.pageKind, "blank");
  assert.equal(saved.slides[1].notes, "Appunti"); assert.equal(saved.slides[1].read, true);
  assert.ok(saved.slides[1].generatedAt);
  assert.equal((await analyze(true)).status, 503, "regeneration bypasses the local filter and requires a model key");
  assert.equal((await readDocument(document.id)).slides[1].explanation?.pageKind, "blank", "a failed override preserves the saved result");
});
