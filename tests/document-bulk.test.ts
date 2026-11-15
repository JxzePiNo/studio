import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createDocument, deleteDocument, listDocuments, readDocument, readDocumentMetadata, setDocumentStudyExclusion } from "../lib/store";
import { createFolder } from "../lib/folders";
import { documentBulkSchema, mutateDocuments } from "../lib/document-bulk";
import { POST } from "../app/api/documents/bulk/route";

test("one bulk request validates the entire selection and excludes, includes or deletes only its PDFs", async t => {
  const previous = process.env.DATA_DIR;
  const directory = await mkdtemp(path.join(os.tmpdir(), "studio-bulk-")); process.env.DATA_DIR = directory;
  t.after(async () => { if (previous === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = previous; await rm(directory, { recursive: true, force: true }); });
  const folder = await createFolder("Analisi"), other = await createFolder("Fisica");
  const first = await createDocument("Slide.pdf", new Uint8Array([1]), 10, folder.id);
  const second = await createDocument("Libro.pdf", new Uint8Array([1]), 20, folder.id);
  const foreign = await createDocument("Altro.pdf", new Uint8Array([1]), 30, other.id);
  const request = (body: unknown) => POST(new Request("http://localhost/api/documents/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  const input = { folderId: folder.id, ids: [first.id, second.id], action: "exclude" };
  assert.equal((await request({ ...input, ids: [] })).status, 400);
  assert.equal((await request({ ...input, ids: [first.id, first.id] })).status, 400);
  assert.equal((await request({ ...input, userId: "other" })).status, 400);
  assert.equal(documentBulkSchema.safeParse({ ...input, ids: Array.from({ length: 101 }, () => crypto.randomUUID()) }).success, false);
  assert.equal((await request({ ...input, ids: [first.id, foreign.id] })).status, 400);
  assert.equal((await readDocument(first.id)).excludedFromStudy, undefined);
  const excluded = await (await request(input)).json();
  assert.deepEqual(new Set(excluded.succeeded), new Set(input.ids)); assert.deepEqual(excluded.failed, []);
  assert.equal((await readDocument(first.id)).excludedFromStudy, true);
  assert.equal((await readDocument(second.id)).excludedFromStudy, true);
  assert.equal((await readDocument(foreign.id)).excludedFromStudy, undefined);
  await request({ ...input, action: "include" });
  assert.equal((await readDocument(second.id)).excludedFromStudy, false);
  const deleted = await (await request({ ...input, action: "delete" })).json();
  assert.deepEqual(new Set(deleted.succeeded), new Set(input.ids)); assert.deepEqual(deleted.failed, []);
  assert.deepEqual((await listDocuments()).map(document => document.id), [foreign.id]);
});

test("bulk storage failures report exact failures and allow retry without repeating successful deletions", async t => {
  const previous = process.env.DATA_DIR;
  const directory = await mkdtemp(path.join(os.tmpdir(), "studio-bulk-retry-")); process.env.DATA_DIR = directory;
  t.after(async () => { if (previous === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = previous; await rm(directory, { recursive: true, force: true }); });
  const folder = await createFolder("Analisi");
  const first = await createDocument("Primo.pdf", new Uint8Array([1]), 1, folder.id), second = await createDocument("Secondo.pdf", new Uint8Array([1]), 1, folder.id);
  const result = await mutateDocuments({ folderId: folder.id, ids: [first.id, second.id], action: "delete" }, {
    metadata: readDocumentMetadata, exclude: setDocumentStudyExclusion,
    remove: async id => { if (id === second.id) throw new Error("Temporary storage failure"); await deleteDocument(id); },
  });
  assert.deepEqual(result.succeeded, [first.id]); assert.deepEqual(result.failed, [second.id]);
  await assert.rejects(readDocument(first.id), { code: "ENOENT" });
  assert.equal((await readDocument(second.id)).id, second.id);
  assert.deepEqual((await mutateDocuments({ folderId: folder.id, ids: result.failed, action: "delete" })).succeeded, [second.id]);
});
