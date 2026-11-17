import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { pdfTextIndex, searchPdf, quoteInPdf } from "../lib/pdf-search";
import { acceptPdfAnswer, inspectPdfAnswer, pdfSourceReferences, pdfUnknownAnswer, pdfVerificationFailure } from "../lib/pdf-only-answer";
import { POST } from "../app/api/documents/[id]/chat/route";
import { createDocument, updateSlide } from "../lib/store";
import { ragProvider } from "./helpers/rag-provider";

const fact = "L'acqua bolle a 100 gradi Celsius a pressione atmosferica.";
async function sourcePdf() {
  const pdf = await PDFDocument.create(); const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage().drawText(fact, { x: 40, y: 500, size: 12, font }); return pdf.save();
}
const answer = { verdict: "yes", segments: [{ kind: "markdown", content: "Il documento indica 100 gradi Celsius a pressione atmosferica." }], support: 0.5, evidence: [{ page: 1, quote: fact }] };

test("source references bind mathematical text to original page 51 without model-transcribed quotes", () => {
  const index = { totalPages: 76, complete: false, pages: { 51: "DEFINIZIONE: Si chiama circuito hamiltoniano una sequenza chiusa di vertici (𝑥₁, 𝑥₂, …, 𝑥ₙ, 𝑥₁)." } };
  const references = pdfSourceReferences(index);
  const response = { ...answer, evidence: [{ sourceId: "P51_B1" }] };
  const verified = inspectPdfAnswer(references.decode(response), index);
  assert.equal(verified.reason, "accepted");
  assert.equal(verified.answer?.evidence[0].page, 51);
  assert.equal(verified.answer?.evidence[0].quote, index.pages[51]);
  assert.equal(references.schema.safeParse({ ...response, evidence: [{ sourceId: "P1_B1" }] }).success, false);
});

test("PDF search uses original text and only accepts literal source quotes at the requested threshold", async () => {
  const index = await pdfTextIndex(await sourcePdf());
  assert.ok(index.pages[1].includes("100 gradi"));
  assert.equal(searchPdf(index, "A quanti gradi bolle l'acqua?")[0].page, 1);
  assert.deepEqual(searchPdf(index, "acqua", [2]), []);
  assert.ok(quoteInPdf(index, 1, "acqua bolle a 100 gradi Celsius"));
  assert.ok(acceptPdfAnswer(answer, index));
  assert.equal(acceptPdfAnswer({ ...answer, support: 0.499 }, index), undefined);
  assert.equal(acceptPdfAnswer({ ...answer, evidence: [{ page: 2, quote: fact }] }, index), undefined);
  assert.equal(acceptPdfAnswer({ ...answer, evidence: [{ page: 1, quote: "La luna è fatta di formaggio" }] }, index), undefined);
  assert.equal(acceptPdfAnswer({ ...answer, evidence: [] }, index), undefined);
  assert.equal(inspectPdfAnswer({ ...answer, evidence: [] }, index).reason, "missing_citations");
  assert.equal(inspectPdfAnswer({ ...answer, evidence: [{ page: 2, quote: fact }] }, index).reason, "invalid_citations");
  assert.equal(inspectPdfAnswer({ ...answer, support: 0.49 }, index).reason, "low_support");
  assert.equal(quoteInPdf({ pages: { 1: "Il valore cresce quando a + b = 10." }, totalPages: 1, complete: true }, 1, "Il valore cresce quando a - b = 10."), false);
});

test("PDF-only chat excludes private context and outside attachments, abstains without evidence, and cites valid evidence", async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pdf-only-"));
  const previous = { fetch: globalThis.fetch, data: process.env.DATA_DIR, enabled: process.env.NEXT_PUBLIC_FIREBASE_ENABLED, key: process.env.OPENAI_API_KEY };
  process.env.DATA_DIR = directory; process.env.NEXT_PUBLIC_FIREBASE_ENABLED = "false"; process.env.OPENAI_API_KEY = "fake-no-network";
  t.after(async () => {
    globalThis.fetch = previous.fetch;
    for (const [key, value] of Object.entries({ DATA_DIR: previous.data, NEXT_PUBLIC_FIREBASE_ENABLED: previous.enabled, OPENAI_API_KEY: previous.key })) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await rm(directory, { recursive: true, force: true });
  });
  const doc = await createDocument("Acqua.pdf", await sourcePdf(), 1);
  await updateSlide(doc.id, 1, slide => ({ ...slide, notes: "PRIVATE_NOTES", explanation: { title: "T", language: "it", overview: "GENERATED_UNVERIFIED_ANALYSIS", concepts: [], glossary: [], example: "", takeaway: "" }, chat: [{ role: "assistant", content: "OLD_UNVERIFIED_ANSWER" }] }));
  let generated: unknown = answer, repairTo: unknown, calls = 0;
  globalThis.fetch = ragProvider().wrap(async (_url, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    assert.equal(body.text.format.name, "pdf_only_answer");
    assert.deepEqual(body.tools, []); assert.equal(body.tool_choice, "none");
    const text = JSON.stringify(body.input);
    const files = body.input[0].content.filter((part: { type: string }) => part.type === "input_file");
    assert.equal(files.length, 1);
    assert.equal((await PDFDocument.load(Buffer.from(files[0].file_data.split(",")[1], "base64"))).getPageCount(), 1);
    for (const secret of ["PRIVATE_NOTES", "GENERATED_UNVERIFIED_ANALYSIS", "OLD_UNVERIFIED_ANSWER", "OUTSIDE_ATTACHMENT"]) assert.ok(!text.includes(secret));
    assert.ok(text.includes("100 gradi"));
    const output = generated;
    if (repairTo) { generated = repairTo; repairTo = undefined; }
    return Response.json({ id: `resp_${calls}`, status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify(output), annotations: [] }] }] });
  });
  const ask = (id = doc.id) => POST(new Request(`http://127.0.0.1/api/documents/${id}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page: 1, question: "L'acqua bolle a 100 gradi?", scope: "exam", pdfOnly: true, attachments: [{ name: "altro.txt", data: Buffer.from("OUTSIDE_ATTACHMENT").toString("base64") }] }) }), { params: Promise.resolve({ id }) });
  const success = await ask(); assert.equal(success.status, 200);
  const messages = await success.json();
  assert.match(messages.at(-1).content, /^Sì\./); assert.match(messages.at(-1).content, /Fonte: PDF corrente, pagine 1/);
  assert.equal(messages.at(-2).attachments, undefined);
  generated = { ...answer, support: 0.49 };
  assert.equal((await (await ask()).json()).at(-1).content, pdfUnknownAnswer);
  generated = { ...answer, support: 1, evidence: [{ page: 1, quote: "La luna è fatta di formaggio." }] };
  assert.equal((await (await ask()).json()).at(-1).content, pdfVerificationFailure);
  generated = { ...answer, evidence: [{ page: 99, quote: fact }] }; repairTo = answer;
  assert.match((await (await ask()).json()).at(-1).content, /Fonte: PDF corrente, pagine 1/, "a corrected physical page is accepted after one retry");
  const blank = await PDFDocument.create(); blank.addPage();
  const scanned = await createDocument("Immagini.pdf", await blank.save(), 1);
  assert.match((await (await ask(scanned.id)).json()).at(-1).content, /^Non lo so/);
  assert.equal(calls, 6, "invalid citations receive one correction; unreadable PDFs make no speculative call");
});

test("PDF-only answers can cite full-page information outside all retrieved chunks", async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pdf-whole-page-"));
  const previous = { fetch: globalThis.fetch, data: process.env.DATA_DIR, enabled: process.env.NEXT_PUBLIC_FIREBASE_ENABLED, key: process.env.OPENAI_API_KEY };
  process.env.DATA_DIR = directory; process.env.NEXT_PUBLIC_FIREBASE_ENABLED = "false"; process.env.OPENAI_API_KEY = "fake-page-network";
  t.after(async () => {
    globalThis.fetch = previous.fetch;
    for (const [key, value] of Object.entries({ DATA_DIR: previous.data, NEXT_PUBLIC_FIREBASE_ENABLED: previous.enabled, OPENAI_API_KEY: previous.key })) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await rm(directory, { recursive: true, force: true });
  });
  const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica), page = pdf.addPage();
  const intro = "L'entropia viene discussa in questa pagina.";
  const conclusion = "Il risultato finale documentato vale quarantadue.";
  page.drawText(intro, { x: 20, y: 820, font, size: 7 });
  const filler = "Questo paragrafo contiene soltanto dettagli intermedi. ".repeat(150);
  for (let offset = 0; offset < filler.length; offset += 100) page.drawText(filler.slice(offset, offset + 100), { x: 20, y: 800 - offset / 100 * 7, font, size: 7 });
  page.drawText(conclusion, { x: 20, y: 50, font, size: 7 });
  const doc = await createDocument("Contesto.pdf", await pdf.save(), 1);
  const provider = ragProvider();
  const mock = provider.wrap(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.ok(JSON.stringify(body.input).includes(conclusion), "the model sees the complete page, beyond the retrieval window");
    return Response.json({ id: "resp_whole_page", status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify({ verdict: "open", segments: [{ kind: "markdown", content: "Il risultato documentato vale quarantadue." }], support: 1, evidence: [{ page: 1, quote: conclusion }] }), annotations: [] }] }] });
  });
  globalThis.fetch = async (url, init) => {
    const result = await mock(url, init);
    if (!String(url).endsWith("/search")) return result;
    const data = await result.json();
    data.data[0].content[0].text = "[[PDF_PAGE_000001]]\n" + intro;
    return Response.json(data);
  };
  const response = await POST(new Request(`http://localhost/api/documents/${doc.id}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page: 1, scope: "document", question: "Spiega entropia", pdfOnly: true }) }), { params: Promise.resolve({ id: doc.id }) });
  assert.equal(response.status, 200);
  const saved = (await response.json()).at(-1);
  assert.match(saved.content, /quarantadue/);
  assert.match(saved.content, /pagine 1/);
  assert.ok(saved.retrieval.every((chunk: { text: string }) => !chunk.text.includes(conclusion)), "the verified answer comes from outside the retrieved chunks");
});
