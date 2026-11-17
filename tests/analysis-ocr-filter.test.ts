import test from "node:test";
import assert from "node:assert/strict";
import { classifyOcrPage, ocrRasterCandidate } from "../lib/analysis-ocr-filter";
import type { OcrLine, OcrPage } from "../lib/local-page-ocr";

function fixture(text = "Introduction"): OcrPage {
  const pixels = new Uint8ClampedArray(800 * 600 * 4).fill(255);
  const bbox = { x0: 200, y0: 250, x1: 500, y1: 280 };
  return { width: 800, height: 600, pixels, lines: [{ text, confidence: 96, bbox, words: [{ text, confidence: 96, bbox }] }] };
}
function ink(page: OcrPage, x: number, y: number) {
  const p = (y * page.width + x) * 4;
  page.pixels[p] = page.pixels[p + 1] = page.pixels[p + 2] = 0;
}

test("OCR classifies title separators with decorative rules and genuinely empty scans", () => {
  const page = fixture();
  for (let x = 200; x < 650; x++) ink(page, x, 300);
  assert.equal(classifyOcrPage(page)?.pageKind, "title");
  page.lines = [];
  assert.equal(classifyOcrPage(page), undefined, "unrecognized ink must not become a blank page");
  page.pixels.fill(255);
  assert.equal(classifyOcrPage(page)?.pageKind, "blank");
});

test("dense raster content bypasses OCR, while sparse title candidates reach recognition", () => {
  const page = fixture();
  assert.equal(ocrRasterCandidate(page.width, page.height, page.pixels), true);
  for (let y = 200; y < 450; y++) for (let x = 200; x < 600; x++) ink(page, x, y);
  assert.equal(ocrRasterCandidate(page.width, page.height, page.pixels), false);
});

test("unrecognized graphs, faint formulas, handwritten marks and low-confidence OCR veto exclusion", () => {
  for (const kind of ["graph", "faint", "confidence", "word", "formula", "definition", "top", "geometry"]) {
    const page = fixture();
    if (kind === "graph" || kind === "faint") {
      for (let y = 350; y < 430; y++) ink(page, 300, y);
      if (kind === "faint") for (let y = 350; y < 430; y++) for (let c = 0; c < 3; c++) page.pixels[(y * 800 + 300) * 4 + c] = 220;
    }
    if (kind === "confidence") page.lines[0].confidence = 50;
    if (kind === "word") page.lines[0].words[0].confidence = 40;
    if (kind === "formula") page.lines[0].text = "E = mc2";
    if (kind === "definition") page.lines[0].text = "Una spiegazione completa.";
    if (kind === "top") page.lines[0].bbox.y0 = 10;
    if (kind === "geometry") page.lines[0].bbox.x0 = NaN;
    assert.equal(classifyOcrPage(page), undefined, kind);
  }
});

test("an explicit index can omit printed page numbers but explanations and residual pictures are retained", () => {
  const page = fixture();
  page.lines = ["Outline", "Introduction", "Course Organization", "Concluding Remarks"].map((text, i): OcrLine => {
    const bbox = { x0: 100, y0: 30 + i * 100, x1: 550, y1: 55 + i * 100 };
    return { text, confidence: 96, bbox, words: [{ text, confidence: 96, bbox }] };
  });
  assert.equal(classifyOcrPage(page)?.pageKind, "index");
  page.lines[1].text = "This sentence explains the subject.";
  assert.equal(classifyOcrPage(page), undefined);
  page.lines[1].text = "Introduction";
  for (let y = 400; y < 450; y++) ink(page, 700, y);
  assert.equal(classifyOcrPage(page), undefined);
});
