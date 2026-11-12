import { PDFDocument } from "pdf-lib";

const sources = new Map<string, { pdf: Promise<PDFDocument>; readers: number }>();

/** Share only overlapping extractions, then release the original before AI calls.
 * The caller supplies a document AND authenticated-session key. No cross-instance cache. */
export async function extractAnalysisPage(key: string, page: number, read: () => Promise<Uint8Array>) {
  let source = sources.get(key);
  if (!source) {
    source = { pdf: Promise.resolve().then(read).then(bytes => PDFDocument.load(bytes)), readers: 0 };
    sources.set(key, source);
  }
  source.readers++;
  try {
    const original = await source.pdf;
    const single = await PDFDocument.create();
    const [copied] = await single.copyPages(original, [page - 1]);
    single.addPage(copied);
    return await single.save();
  } finally {
    source.readers--;
    if (!source.readers && sources.get(key) === source) sources.delete(key);
  }
}
