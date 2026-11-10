import test from "node:test";
import assert from "node:assert/strict";
import { moveMaterial, orderedMaterials } from "../lib/material-order";
import type { DocumentSummary } from "../lib/types";

const docs: DocumentSummary[] = [
  { id: "a", name: "Lezione 10", createdAt: "2026-01-01" },
  { id: "b", name: "Lezione 2", createdAt: "2026-01-02" },
  { id: "c", name: "Lezione 1", createdAt: "2026-01-03" },
].map(d => ({ ...d, pages: 3, size: 100, currentPage: 1, analyzedPages: 0 }));

test("manual material order keeps new uploads at the end and ignores removed IDs", () => {
  assert.deepEqual(orderedMaterials(docs, ["removed", "c", "a"]).map(d => d.id), ["c", "a", "b"]);
  assert.deepEqual(docs.map(d => d.id), ["a", "b", "c"]);
});
test("moving material preserves every ID and clamps list boundaries", () => {
  assert.deepEqual(moveMaterial(docs, [], "a", "up"), ["a", "b", "c"]);
  assert.deepEqual(moveMaterial(docs, [], "a", "last"), ["b", "c", "a"]);
  assert.deepEqual(moveMaterial(docs, [], "c", "first"), ["c", "a", "b"]);
  assert.deepEqual(moveMaterial(docs, [], "b", "down"), ["a", "c", "b"]);
  assert.throws(() => moveMaterial(docs, [], "foreign", "up"), /non trovato/);
});
test("sorting lesson names uses numeric order", () => {
  assert.deepEqual(moveMaterial(docs, [], undefined, "name"), ["c", "b", "a"]);
});
