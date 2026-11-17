import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { topRagPages, ragPageAttachments, type RagPageHit } from "../lib/rag-pages";

test("the three highest-ranked chunks select at most three original pages, deduplicated by document and page", async () => {
  const hit = (documentId: string, page: number, score: number): RagPageHit => ({ documentId, documentName: documentId, page, score, text: "chunk", pageText: "complete page" });
  const pages = topRagPages([hit("A", 1, 0.1), hit("B", 1, 0.7), hit("A", 2, 0.9), hit("A", 2, 0.8)]);
  assert.deepEqual(pages.map(page => [page.documentId, page.page]), [["A", 2], ["B", 1]]);
  const a = await PDFDocument.create(); a.addPage([200, 300]); a.addPage([400, 500]);
  const b = await PDFDocument.create(); b.addPage([600, 700]);
  const bytes = new Map([["A", await a.save()], ["B", await b.save()]]);
  const attachments = await ragPageAttachments(pages, async id => bytes.get(id)!);
  assert.equal(attachments.content.length, 2);
  const extracted = await Promise.all(attachments.content.map(file => PDFDocument.load(Buffer.from(file.file_data.split(",")[1], "base64"))));
  assert.deepEqual(extracted.map(pdf => [pdf.getPageCount(), pdf.getPage(0).getWidth()]), [[1, 400], [1, 600]]);
  assert.match(attachments.manifest, /pagina 1 dell'allegato = pagina FISICA 2/);
});
