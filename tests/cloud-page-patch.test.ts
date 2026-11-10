import assert from "node:assert/strict";
import test from "node:test";
import type { DocumentReference, Transaction } from "firebase-admin/firestore";
import { applyPagePatch } from "../lib/cloud-page-patch";

test("reader writes read one metadata document and at most the requested slide", async () => {
  let metadata: Record<string, unknown> = { id: "pdf", pages: 100, currentPage: 1, readPages: 20, analyzedPages: 100, contentRevision: "v1" };
  let slide = { notes: "Appunti", read: false, explanation: { title: "Preservata" }, chat: [{ role: "assistant", content: "Preservata" }] };
  let reads: string[] = [];
  let writes = 0;
  const reference = { path: "users/a/documents/pdf", collection: () => ({ doc: (id: string) => ({ path: `users/a/documents/pdf/slides/${id}` }) }) } as unknown as DocumentReference;
  const tx = {
    get: async (ref: { path: string }) => { reads.push(ref.path); const data = ref.path === reference.path ? metadata : slide; return { exists: true, data: () => structuredClone(data), get: (key: string) => data[key as keyof typeof data] }; },
    update: (_ref: unknown, value: Record<string, unknown>) => { metadata = { ...metadata, ...value }; writes++; },
    set: (_ref: unknown, value: typeof slide) => { slide = structuredClone(value); writes++; },
  } as unknown as Transaction;
  await applyPagePatch(tx, reference, 50, {});
  assert.deepEqual(reads, [reference.path]);
  assert.equal(metadata.currentPage, 50);
  assert.equal(metadata.contentRevision, "v1");
  reads = []; writes = 0;
  await applyPagePatch(tx, reference, 50, { read: true });
  assert.deepEqual(reads, [reference.path, `${reference.path}/slides/50`]);
  assert.equal(metadata.readPages, 21);
  assert.equal(metadata.analyzedPages, 100);
  assert.equal(slide.notes, "Appunti");
  assert.equal(slide.chat[0].content, "Preservata");
  assert.notEqual(metadata.contentRevision, "v1");
  writes = 0;
  await applyPagePatch(tx, reference, 50, { read: true });
  assert.equal(metadata.readPages, 21, "retried writes do not increment twice");
  assert.equal(writes, 0, "unchanged data is not rewritten");
  await applyPagePatch(tx, reference, 50, { notes: "Nuovi appunti" });
  assert.equal(metadata.readPages, 21);
  assert.equal(slide.read, true);
  await applyPagePatch(tx, reference, 50, { read: false });
  assert.equal(metadata.readPages, 20);
  reads = [];
  await assert.rejects(applyPagePatch(tx, reference, 101, {}), /Pagina non valida/);
  assert.equal(reads.length, 1);
});
