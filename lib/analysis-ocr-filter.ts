import type { Explanation } from "./types";
import type { OcrBox, OcrPage } from "./local-page-ocr";

const indexHeading = /^(indice|sommario|outline|contents|table of contents)\s*$/i;
const titleText = /^[\p{L}\s'’(),:–—-]+$/u;

/** Cheap rejection before OCR: dense text and large continuous illustrations
 * cannot satisfy our conservative title/index layouts. False negatives analyze. */
export function ocrRasterCandidate(width: number, height: number, pixels: Uint8ClampedArray) {
  if (width < 100 || height < 100 || width * height > 2_560_000 || pixels.length !== width * height * 4) return false;
  let ink = 0, occupied = 0, band = 0;
  for (let y = Math.floor(height * .14); y < Math.floor(height * .88); y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      if (pixels[p + 3] >= 128 && Math.min(pixels[p], pixels[p + 1], pixels[p + 2]) < 235) row++;
    }
    ink += row;
    if (row > 2) { occupied++; band++; } else band = 0;
    if (ink > width * height * .025 || occupied > height * .35 || band > height * .13) return false;
  }
  return true;
}

/** OCR text is only a proposal: unexplained pixels veto every skip decision. */
export function classifyOcrPage(page: OcrPage, diagnostics?: { residual?: number; stripes?: { y: number; height: number; pixels: number }[] }): Explanation | undefined {
  const { width, height, pixels } = page;
  if (width < 100 || height < 100 || width * height > 2_560_000 || pixels.length !== width * height * 4) return;
  const lines = page.lines.filter(line => line.text.trim());
  const boxValid = (box: OcrBox) => [box.x0, box.y0, box.x1, box.y1].every(Number.isFinite)
    && box.x0 >= 0 && box.y0 >= 0 && box.x1 <= width && box.y1 <= height && box.x1 > box.x0 && box.y1 > box.y0;
  if (lines.some(line => !boxValid(line.bbox) || !Number.isFinite(line.confidence) || line.confidence < 85
    || !line.words.length || line.words.some(word => !boxValid(word.bbox) || !Number.isFinite(word.confidence) || word.confidence < 80))) return;
  const footer = (line: typeof lines[number]) => /^\d{1,4}$/.test(line.text.trim())
    && line.bbox.y0 > height * .88 && line.bbox.y1 - line.bbox.y0 < height * .04;
  const body = lines.filter(line => !footer(line));
  let kind: "title" | "index" | "blank";
  let title: string;
  let headerBottom = 0;
  if (!lines.length) { kind = "blank"; title = "Pagina bianca"; }
  else if (body.length >= 4 && body.length <= 14 && indexHeading.test(body[0].text)) {
    if (body.slice(1).some(line => line.text.length > 120 || line.text.split(/\s+/).length > 18
      || !titleText.test(line.text.replace(/(?:\.{2,}|\s)\s*\d{1,4}\s*$/, "")))) return;
    kind = "index"; title = body[0].text;
    // A solid dark title band is permitted only behind an explicit index heading.
    if (body[0].bbox.y1 < height * .15) {
      for (let y = 0; y < Math.floor(height * .15); y++) {
        let dark = 0;
        for (let x = 0; x < width; x++) {
          const p = (y * width + x) * 4;
          if (Math.max(pixels[p], pixels[p + 1], pixels[p + 2]) < 160) dark++;
        }
        if (dark > width * .8) headerBottom = y + 1;
        else if (headerBottom) break;
      }
      if (headerBottom < body[0].bbox.y1) headerBottom = 0;
    }
  } else {
    const text = body.map(line => line.text).join(" ");
    if (!body.length || body.length > 3 || text.length > 160 || text.split(/\s+/).length > 18 || !titleText.test(text)
      || body.some(line => line.bbox.y0 < height * .25 || line.bbox.y1 > height * .75
        || line.bbox.y1 - line.bbox.y0 < height * .025)) return;
    kind = "title"; title = text;
  }

  const mask = new Uint8Array(width * height);
  for (const line of lines) for (const word of line.words) {
    const pad = 3;
    const x0 = Math.max(0, Math.floor(word.bbox.x0 - pad)), x1 = Math.min(width, Math.ceil(word.bbox.x1 + pad));
    for (let y = Math.max(0, Math.floor(word.bbox.y0 - pad)); y < Math.min(height, Math.ceil(word.bbox.y1 + pad)); y++) mask.fill(1, y * width + x0, y * width + x1);
  }
  // Count all foreground outside recognized words. Thin horizontal decoration is
  // allowed; graphs, logos, handwriting and missed formulas retain residual ink.
  const rows: { count: number; min: number; max: number }[] = [];
  for (let y = 0; y < height; y++) {
    const row = { count: 0, min: width, max: 0 };
    for (let x = 0; x < width; x++) {
      const i = y * width + x, p = i * 4;
      if (y < headerBottom || mask[i] || pixels[p + 3] < 128) continue;
      if (Math.min(pixels[p], pixels[p + 1], pixels[p + 2]) < 235) {
        row.count++; row.min = Math.min(row.min, x); row.max = x;
      }
    }
    rows.push(row);
  }
  let residual = 0;
  for (let y = 0; y < height;) {
    if (!rows[y].count) { y++; continue; }
    const first = y;
    while (y < height && rows[y].count) y++;
    const stripe = rows.slice(first, y);
    const decoration = kind !== "blank" && y - first <= Math.max(3, Math.floor(height * .006))
      && stripe.every(row => row.max - row.min > width * .2 && row.count / (row.max - row.min + 1) > .8);
    if (!decoration) {
      const count = stripe.reduce((sum, row) => sum + row.count, 0);
      residual += count;
      if (diagnostics) (diagnostics.stripes ||= []).push({ y: first, height: y - first, pixels: count });
    }
  }
  // Do not ignore any residual on an allegedly blank page.
  if (diagnostics) diagnostics.residual = residual;
  if (residual > (kind === "blank" ? 0 : 12)) return;
  return { pageKind: kind, title: title.slice(0, 300), language: "other",
    overview: kind === "blank" ? "Pagina priva di contenuti da analizzare." : kind === "index"
      ? "Indice del documento; gli argomenti saranno analizzati nelle pagine corrispondenti." : "Pagina con solo titolo o separatore di sezione.",
    concepts: [], glossary: [], example: "", takeaway: "" };
}
