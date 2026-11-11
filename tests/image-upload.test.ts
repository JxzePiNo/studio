import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { POST } from "../app/api/documents/route";
import { createFolder } from "../lib/folders";
import { readPdf } from "../lib/store";
import { MAX_UPLOAD_BYTES, uploadFormat } from "../lib/upload-formats";

test("image uploads become readable one-page PDFs and invalid images are rejected", async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "studio-image-upload-"));
  const previous = { data: process.env.DATA_DIR, enabled: process.env.NEXT_PUBLIC_FIREBASE_ENABLED };
  process.env.DATA_DIR = directory; process.env.NEXT_PUBLIC_FIREBASE_ENABLED = "false";
  t.after(async () => {
    if (previous.data === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = previous.data;
    if (previous.enabled === undefined) delete process.env.NEXT_PUBLIC_FIREBASE_ENABLED; else process.env.NEXT_PUBLIC_FIREBASE_ENABLED = previous.enabled;
    await rm(directory, { recursive: true, force: true });
  });
  const folder = await createFolder("Immagini");
  async function upload(name: string, bytes: Uint8Array) {
    const form = new FormData();
    form.append("folderId", folder.id);
    form.append("file", new Blob([new Uint8Array(bytes)]), name);
    return POST(new Request("http://127.0.0.1/api/documents", { method: "POST", body: form }));
  }
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
  const result = await upload("Appunti.PNG", png);
  assert.equal(result.status, 201);
  const doc = await result.json();
  assert.equal(doc.name, "Appunti.pdf"); assert.equal(doc.pages, 1); assert.equal(doc.folderId, folder.id);
  const pdf = await PDFDocument.load(await readPdf(doc.id));
  assert.equal(pdf.getPageCount(), 1); assert.equal(pdf.getPage(0).getWidth(), 1);
  assert.equal((await upload("broken.jpg", new Uint8Array([1, 2, 3]))).status, 400);
  assert.equal((await upload("unsafe.svg", png)).status, 400);
  const original = await PDFDocument.create(); original.addPage();
  assert.equal((await upload("Lezione.pdf", await original.save())).status, 201);
  assert.equal(uploadFormat("foto.JPEG"), "jpeg");
  assert.equal(MAX_UPLOAD_BYTES, 500 * 1024 * 1024);
});
