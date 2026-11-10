import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createDocument, patchDocumentPage, readDocument } from "../lib/store";
import { GET, PATCH } from "../app/api/documents/[id]/route";

test("document validation returns 304 when unchanged and compact page writes preserve content", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "studio-version-"));
  const previous = { data: process.env.DATA_DIR, cloud: process.env.NEXT_PUBLIC_FIREBASE_ENABLED };
  process.env.DATA_DIR = directory; process.env.NEXT_PUBLIC_FIREBASE_ENABLED = "false";
  try {
    const document = await createDocument("Cache.pdf", new Uint8Array([1]), 100);
    const url = `http://127.0.0.1/api/documents/${document.id}`;
    const context = { params: Promise.resolve({ id: document.id }) };
    const first = await GET(new Request(url), context);
    const etag = first.headers.get("etag")!;
    assert.equal(first.status, 200);
    assert.ok(etag);
    const unchanged = await GET(new Request(url, { headers: { "If-None-Match": etag } }), context);
    assert.equal(unchanged.status, 304);
    assert.equal(await unchanged.text(), "");
    const response = await PATCH(new Request(url, { method: "PATCH", headers: { Prefer: "return=minimal", "Content-Type": "application/json" }, body: JSON.stringify({ page: 20, notes: "Salvati", read: true }) }), context);
    const result = await response.json();
    assert.equal(result.slides, undefined, "compact saves never return the whole PDF");
    assert.deepEqual(result.slide, { notes: "Salvati", read: true });
    assert.equal(result.readPages, 1);
    assert.equal((await GET(new Request(url, { headers: { "If-None-Match": etag } }), context)).status, 200);
    await patchDocumentPage(document.id, 90, {});
    const saved = await readDocument(document.id);
    assert.equal(saved.currentPage, 90);
    assert.equal(saved.slides[20].notes, "Salvati");
    await assert.rejects(patchDocumentPage(document.id, 101, {}), /Pagina non valida/);
  } finally {
    if (previous.data === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = previous.data;
    if (previous.cloud === undefined) delete process.env.NEXT_PUBLIC_FIREBASE_ENABLED; else process.env.NEXT_PUBLIC_FIREBASE_ENABLED = previous.cloud;
    await rm(directory, { recursive: true, force: true });
  }
});
