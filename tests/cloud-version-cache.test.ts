import assert from "node:assert/strict";
import test from "node:test";
import type { DocumentReference } from "firebase-admin/firestore";
import { readVersionedSnapshot } from "../lib/cloud-store";
import { documentSnapshots } from "../lib/content-cache";

test("a version check reads only metadata, keeps rename/position fresh and isolates owners", async () => {
  let metadata = { id: "pdf", name: "Originale.pdf", contentRevision: "v1", currentPage: 1, deleting: false };
  let metaReads = 0;
  let slideQueries = 0;
  let exists = true;
  const reference = (owner: string) => ({
    path: `users/${owner}/documents/pdf`,
    get: async () => { metaReads++; return { exists, data: () => ({ ...metadata }), get: (key: keyof typeof metadata) => metadata[key], updateTime: { seconds: 1, nanoseconds: 1 } }; },
    collection: () => ({ get: async () => { slideQueries++; return { docs: [{ id: "1", data: () => ({ notes: "Preservati" }) }] }; } }),
  }) as unknown as DocumentReference;
  const owner = reference("cache-test-a");
  const otherOwner = reference("cache-test-b");
  try {
    const first = await readVersionedSnapshot(owner);
    assert.equal(metaReads, 1); assert.equal(slideQueries, 1);
    metadata = { ...metadata, name: "Rinominato.pdf", currentPage: 20 };
    const second = await readVersionedSnapshot(owner, first.etag);
    assert.equal(second.document, null);
    assert.equal(second.metadata?.name, "Rinominato.pdf");
    assert.equal(second.metadata?.currentPage, 20);
    assert.equal(slideQueries, 1, "position and rename do not reload slides");
    metadata = { ...metadata, contentRevision: "v2" };
    await readVersionedSnapshot(owner, first.etag);
    assert.equal(slideQueries, 2, "changed content reloads slides");
    await readVersionedSnapshot(otherOwner);
    assert.equal(slideQueries, 3, "another account never receives the first account's cache");
    metadata.deleting = true;
    await assert.rejects(readVersionedSnapshot(owner, '"v2"'), /Documento non trovato/);
    metadata.deleting = false; exists = false;
    await assert.rejects(readVersionedSnapshot(owner, '"v2"'), /Documento non trovato/);
  } finally { documentSnapshots.delete(owner.path); documentSnapshots.delete(otherOwner.path); }
});
