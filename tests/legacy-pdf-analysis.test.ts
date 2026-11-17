import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { reusePreviousPdfAnalysis, type PreviousPdf } from "../lib/legacy-pdf-analysis";
import { pdfHash } from "../lib/pdf-content";
import { createDocument, updateDocument, updateSlide, readDocument } from "../lib/store";
import { createFolder } from "../lib/folders";
import type { SlideData } from "../lib/types";

const explanation = { title: "Analisi precedente", language: "it" as const, overview: "Testo", concepts: [], glossary: [], example: "", takeaway: "" };

test("legacy PDF reuse verifies bytes, rejects equal-sized different files and merges only analyzed pages", async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const hashes: string[] = [];
  let wrongSlidesRead = false;
  const candidate: PreviousPdf = { id: "old", pages: 2, size: 3, loadBytes: async () => bytes, saveHash: async hash => { hashes.push(hash); }, loadSlides: async () => ({
    1: { notes: "PRIVATE", read: true, chat: [{ role: "user", content: "PRIVATE" }], explanation },
    2: { notes: "PRIVATE", explanation },
    3: { notes: "", explanation },
  }) };
  const slides: Record<string, SlideData> = { 2: { notes: "", explanation: { ...explanation, title: "Cache recente" } } };
  await reusePreviousPdfAnalysis({ id: "new", pages: 2, size: 3, hash: pdfHash(bytes) }, [
    { ...candidate, id: "different", loadBytes: async () => new Uint8Array([3, 2, 1]), loadSlides: async () => { wrongSlidesRead = true; return {}; } },
    candidate,
  ], slides);
  assert.equal(wrongSlidesRead, false);
  assert.deepEqual(hashes, [pdfHash(new Uint8Array([3, 2, 1])), pdfHash(bytes)]);
  assert.deepEqual(slides[1], { notes: "", explanation });
  assert.equal(slides[2].explanation?.title, "Cache recente");
  assert.equal(slides[3], undefined);
});

test("upload recovers a legacy analysis from another exam without a shared cache or AI call", async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "legacy-pdf-"));
  const previous = { data: process.env.DATA_DIR, enabled: process.env.NEXT_PUBLIC_FIREBASE_ENABLED };
  process.env.DATA_DIR = directory; process.env.NEXT_PUBLIC_FIREBASE_ENABLED = "false";
  t.after(async () => {
    if (previous.data === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = previous.data;
    if (previous.enabled === undefined) delete process.env.NEXT_PUBLIC_FIREBASE_ENABLED; else process.env.NEXT_PUBLIC_FIREBASE_ENABLED = previous.enabled;
    await rm(directory, { recursive: true, force: true });
  });
  const firstExam = await createFolder("Primo esame"), secondExam = await createFolder("Secondo esame");
  const bytes = new Uint8Array([1, 2, 3]);
  const source = await createDocument("Vecchio.pdf", bytes, 1, firstExam.id);
  await updateSlide(source.id, 1, () => ({ notes: "PRIVATE", read: true, explanation, chat: [{ role: "user", content: "PRIVATE" }] }));
  await updateDocument(source.id, doc => { delete doc.contentHash; });
  const duplicate = await createDocument("Rinominato.pdf", bytes, 1, secondExam.id);
  assert.deepEqual(duplicate.slides[1], { notes: "", explanation });
  assert.equal((await readDocument(source.id)).contentHash, pdfHash(bytes));
  assert.equal((await readDocument(source.id)).slides[1].notes, "PRIVATE");
});
