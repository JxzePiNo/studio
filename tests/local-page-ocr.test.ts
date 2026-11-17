import test from "node:test";
import assert from "node:assert/strict";
import { createCanvas } from "@napi-rs/canvas";
import { PDFDocument } from "pdf-lib";
import { filterAnalysisPage } from "../lib/analysis-page-filter";
import { disposeLocalPageOcr } from "../lib/local-page-ocr";

test("image-only PDFs use packaged local OCR and preserve unrecognized diagrams", async t => {
  t.after(disposeLocalPageOcr);
  const previous = process.env.LOCAL_PAGE_OCR;
  t.after(() => { if (previous === undefined) delete process.env.LOCAL_PAGE_OCR; else process.env.LOCAL_PAGE_OCR = previous; });
  for (const kind of ["title", "diagram", "blank"]) {
    const canvas = createCanvas(1000, 600), ctx = canvas.getContext("2d");
    ctx.fillStyle = "white"; ctx.fillRect(0, 0, 1000, 600);
    if (kind !== "blank") { ctx.fillStyle = "black"; ctx.font = "40px sans-serif"; ctx.fillText("Introduction", 260, 300); }
    if (kind === "diagram") { ctx.beginPath(); ctx.moveTo(200, 400); ctx.lineTo(300, 350); ctx.lineTo(400, 430); ctx.stroke(); }
    const pdf = await PDFDocument.create();
    const image = await pdf.embedPng(canvas.toBuffer("image/png"));
    pdf.addPage([500, 300]).drawImage(image, { x: 0, y: 0, width: 500, height: 300 });
    const bytes = await pdf.save();
    process.env.LOCAL_PAGE_OCR = "false";
    assert.equal(await filterAnalysisPage(bytes), undefined, "disabled OCR preserves image pages for analysis");
    process.env.LOCAL_PAGE_OCR = "true";
    const result = await filterAnalysisPage(bytes);
    assert.equal(result?.pageKind, kind === "diagram" ? undefined : kind);
  }
});
