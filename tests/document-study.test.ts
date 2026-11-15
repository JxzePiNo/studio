import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createDocument, listDocuments, readDocument, updateDocument } from "../lib/store";
import { PATCH } from "../app/api/documents/[id]/study-settings/route";

test("study exclusion survives reload without changing the document or its reading progress", async t => {
  const before = process.env.DATA_DIR;
  const directory = await mkdtemp(path.join(os.tmpdir(), "studio-study-exclusion-"));
  process.env.DATA_DIR = directory;
  t.after(async () => { if (before === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = before; await rm(directory, { recursive: true, force: true }); });
  const doc = await createDocument("Libro.pdf", new Uint8Array([1]), 20);
  await updateDocument(doc.id, current => { current.slides[1] = { notes: "Appunti conservati", read: true }; });
  const request = (body: unknown) => PATCH(new Request(`http://localhost/api/documents/${doc.id}/study-settings`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id: doc.id }) });
  assert.equal((await request({ excludedFromStudy: "true" })).status, 400);
  assert.equal((await request({ excludedFromStudy: true, userId: "other" })).status, 400);
  assert.equal((await request({ excludedFromStudy: true })).status, 200);
  const stored = await readDocument(doc.id);
  assert.equal(stored.excludedFromStudy, true);
  assert.equal(stored.pages, 20);
  assert.equal(stored.slides[1].notes, "Appunti conservati");
  assert.equal(stored.slides[1].read, true);
  assert.equal((await listDocuments())[0].excludedFromStudy, true);
  assert.equal((await request({ excludedFromStudy: false })).status, 200);
  assert.equal((await readDocument(doc.id)).excludedFromStudy, false);
});
