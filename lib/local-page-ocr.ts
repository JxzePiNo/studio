import { copyFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { PDFPageProxy } from "pdfjs-dist";
import type { Worker } from "tesseract.js";
import { ocrRasterCandidate } from "./analysis-ocr-filter";

export type OcrBox = { x0: number; y0: number; x1: number; y1: number };
export type OcrWord = { text: string; confidence: number; bbox: OcrBox };
export type OcrLine = OcrWord & { words: OcrWord[] };
export type OcrPage = { width: number; height: number; pixels: Uint8ClampedArray; lines: OcrLine[] };

let worker: Promise<Worker> | undefined;
let tail: Promise<unknown> = Promise.resolve();
let queued = 0;
let idle: ReturnType<typeof setTimeout> | undefined;

async function createLocalWorker() {
  const { createWorker, OEM, PSM } = await import("tesseract.js");
  // Both languages must share one local directory. An explicit filesystem path
  // prevents the library's default CDN fallback; nothing is downloaded at runtime.
  const directory = await mkdtemp(path.join(os.tmpdir(), "studio-ocr-"));
  try {
    await Promise.all([
      copyFile(path.join(path.dirname(require.resolve("@tesseract.js-data/eng/package.json")), "4.0.0_best_int/eng.traineddata.gz"), path.join(directory, "eng.traineddata.gz")),
      copyFile(path.join(path.dirname(require.resolve("@tesseract.js-data/ita/package.json")), "4.0.0_best_int/ita.traineddata.gz"), path.join(directory, "ita.traineddata.gz")),
    ]);
    const created = await createWorker("eng", OEM.LSTM_ONLY, {
      workerPath: require.resolve("tesseract.js/src/worker-script/node/index.js"),
      langPath: directory, cacheMethod: "none", errorHandler: () => {},
    });
    try {
      // The packaged Italian model requests this optional user dictionary.
      await created.writeText("ita.special-words", "");
      await created.reinitialize("eng+ita");
      await created.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, user_defined_dpi: "150" });
      return created;
    } catch (error) { await created.terminate(); throw error; }
  } finally { await rm(directory, { recursive: true, force: true }); }
}

/** One worker per server process, bounded queue, no retained page images. */
export async function localPageOcr(page: PDFPageProxy): Promise<OcrPage | undefined> {
  if (process.env.LOCAL_PAGE_OCR === "false" || queued >= 16) return;
  queued++;
  if (idle) clearTimeout(idle);
  const enqueuedAt = Date.now();
  const task = tail.then(async () => {
    if (Date.now() - enqueuedAt > 20_000) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let current: Promise<Worker> | undefined;
    try {
      return await Promise.race([
        (async () => {
          const { createCanvas } = await import("@napi-rs/canvas");
          const natural = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: Math.min(2.5, 1600 / Math.max(natural.width, natural.height)) });
          const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
          const context = canvas.getContext("2d");
          await page.render({ canvasContext: context as unknown as CanvasRenderingContext2D, viewport, background: "white" }).promise;
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          if (!ocrRasterCandidate(canvas.width, canvas.height, pixels)) return;
          current = worker ||= createLocalWorker();
          const engine = await current;
          const { PSM } = await import("tesseract.js");
          await engine.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
          const { data } = await engine.recognize(canvas.toBuffer("image/png"), {}, { text: true, blocks: true });
          const lines = (data.blocks || []).flatMap(block => block.paragraphs.flatMap(paragraph => paragraph.lines))
            .map(line => ({ text: line.text.trim(), confidence: line.confidence, bbox: line.bbox,
              words: line.words.map(word => ({ text: word.text, confidence: word.confidence, bbox: word.bbox })) }));
          if (lines.length <= 14) {
            // Sparse page segmentation can miss inverse-color headings and tiny
            // page numbers. Inspect only these two bounded strips separately.
            for (const [start, end, invert] of [[0, .14, true], [.88, 1, false]] as const) {
              let x = 0, y = Math.floor(canvas.height * start), w = canvas.width, h = Math.floor(canvas.height * (end - start));
              if (!invert) {
                const image = context.getImageData(0, y, w, h);
                let x0 = w, y0 = h, x1 = 0, y1 = 0;
                for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
                  const p = (yy * w + xx) * 4;
                  if (Math.min(image.data[p], image.data[p + 1], image.data[p + 2]) < 235) {
                    x0 = Math.min(x0, xx); x1 = Math.max(x1, xx); y0 = Math.min(y0, yy); y1 = Math.max(y1, yy);
                  }
                }
                if (x0 > x1) continue;
                x = Math.max(0, x0 - 8); y += Math.max(0, y0 - 8);
                w = Math.min(canvas.width - x, x1 - x + 9); h = Math.min(canvas.height - y, y1 - Math.max(0, y0 - 8) + 9);
              }
              const strip = createCanvas(w, h), ctx = strip.getContext("2d");
              ctx.drawImage(canvas, x, y, w, h, 0, 0, w, h);
              if (invert) {
                const image = ctx.getImageData(0, 0, strip.width, strip.height);
                for (let p = 0; p < image.data.length; p += 4) for (let c = 0; c < 3; c++) image.data[p + c] = 255 - image.data[p + c];
                ctx.putImageData(image, 0, 0);
              }
              await engine.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
              const extra = await engine.recognize(strip.toBuffer("image/png"), {}, { text: true, blocks: true });
              const shift = (bbox: OcrBox) => ({ x0: bbox.x0 + x, x1: bbox.x1 + x, y0: bbox.y0 + y, y1: bbox.y1 + y });
              for (const line of (extra.data.blocks || []).flatMap(block => block.paragraphs.flatMap(paragraph => paragraph.lines))) {
                const bbox = shift(line.bbox);
                if (!lines.some(existing => Math.abs(existing.bbox.y0 - bbox.y0) < 8)) lines.push({
                  text: line.text.trim(), confidence: line.confidence, bbox,
                  words: line.words.map(word => ({ text: word.text, confidence: word.confidence, bbox: shift(word.bbox) })),
                });
              }
            }
          }
          lines.sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
          return { width: canvas.width, height: canvas.height, pixels, lines };
        })(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Local OCR deadline")), 12_000); }),
      ]);
    } catch {
      if (worker === current) worker = undefined;
      void current?.then(value => value.terminate()).catch(() => {});
      return;
    } finally { if (timer) clearTimeout(timer); }
  });
  tail = task.then(() => {}, () => {});
  try { return await task; }
  finally {
    queued--;
    if (!queued) {
      idle = setTimeout(() => { void disposeLocalPageOcr(); }, 2000);
      idle.unref();
    }
  }
}

export async function disposeLocalPageOcr() {
  if (idle) clearTimeout(idle);
  idle = undefined;
  const current = worker;
  worker = undefined;
  await current?.then(value => value.terminate()).catch(() => {});
}
