import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDocument, deleteDocument, documentDir, listDocuments, readDocument, readPdf, updateDocument } from "../lib/store";

test("local document storage", async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "margine-store-"));
  const previous = process.env.DATA_DIR;
  process.env.DATA_DIR = directory;
  t.after(async () => {
    if (previous === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  });

  await t.test("persists original bytes and serializes concurrent note updates", async () => {
    const bytes = new Uint8Array([37, 80, 68, 70, 45]);
    const doc = await createDocument("Lezione.pdf", bytes, 25);
    assert.deepEqual(new Uint8Array(await readPdf(doc.id)), bytes);
    await Promise.all(Array.from({ length: 25 }, (_, index) => updateDocument(doc.id, stored => {
      stored.slides[index + 1] = { notes: `Nota ${index + 1}` };
    })));
    const stored = await readDocument(doc.id);
    assert.equal(Object.keys(stored.slides).length, 25);
    assert.equal(stored.slides[1].notes, "Nota 1");
    assert.equal(stored.slides[25].notes, "Nota 25");
    assert.deepEqual((await readdir(documentDir(doc.id))).sort(), ["document.json", "original.pdf"]);
    await deleteDocument(doc.id);
  });

  await t.test("deletion is queued between earlier and later writes", async () => {
    const doc = await createDocument("Da eliminare.pdf", new Uint8Array([1]), 1);
    const firstWrite = updateDocument(doc.id, stored => { stored.slides[1] = { notes: "Ultima nota" }; });
    const deletion = deleteDocument(doc.id);
    const lateWrite = updateDocument(doc.id, stored => { stored.currentPage = 1; });
    const results = await Promise.allSettled([firstWrite, deletion, lateWrite]);
    assert.equal(results[0].status, "fulfilled");
    assert.equal(results[1].status, "fulfilled");
    assert.equal(results[2].status, "rejected");
    await assert.rejects(readDocument(doc.id), { code: "ENOENT" });
  });

  await t.test("incomplete upload directories do not hide the library", async () => {
    const doc = await createDocument("Visibile.pdf", new Uint8Array([1]), 2);
    const incomplete = documentDir(randomUUID());
    await mkdir(incomplete);
    assert.deepEqual((await listDocuments()).map(item => item.id), [doc.id]);
    await rm(incomplete, { recursive: true });
    await deleteDocument(doc.id);
  });

  await t.test("does not silently discard corrupt metadata", async () => {
    const corrupt = documentDir(randomUUID());
    await mkdir(corrupt);
    await writeFile(path.join(corrupt, "document.json"), "{broken");
    await assert.rejects(listDocuments(), SyntaxError);
    await rm(corrupt, { recursive: true });
  });

  await t.test("cached reads are isolated and refresh after writes or deletion", async () => {
    const doc = await createDocument("Cache.pdf", new Uint8Array([1, 2, 3]), 2);
    const first = await readDocument(doc.id);
    first.name = "Modifica non salvata";
    first.slides[1] = { notes: "Non salvato", read: true };
    const second = await readDocument(doc.id);
    assert.equal(second.name, "Cache.pdf");
    assert.equal(second.slides[1], undefined);
    await assert.rejects(updateDocument(doc.id, stored => {
      stored.name = "Non deve finire in cache";
      throw new Error("Operazione annullata");
    }));
    assert.equal((await readDocument(doc.id)).name, "Cache.pdf");
    await updateDocument(doc.id, stored => { stored.slides[1] = { notes: "Salvato", read: true }; });
    assert.equal((await readDocument(doc.id)).slides[1].notes, "Salvato");
    const pdf = await readPdf(doc.id);
    pdf[0] = 99;
    assert.deepEqual([...await readPdf(doc.id)], [1, 2, 3]);
    // Another process replaces stored data: revision checks must reject old entries.
    const changed = await readDocument(doc.id);
    changed.name = "Aggiornato da altra sessione";
    await writeFile(path.join(documentDir(doc.id), "document.json"), JSON.stringify(changed));
    assert.equal((await readDocument(doc.id)).name, changed.name);
    await writeFile(path.join(documentDir(doc.id), "original.pdf"), new Uint8Array([4, 5]));
    assert.deepEqual([...await readPdf(doc.id)], [4, 5]);
    await deleteDocument(doc.id);
    await assert.rejects(readDocument(doc.id), { code: "ENOENT" });
    await assert.rejects(readPdf(doc.id), { code: "ENOENT" });
  });

  await t.test("read progress persists independently of notes and analysis", async () => {
    const doc = await createDocument("Lettura.pdf", new Uint8Array([1]), 20);
    await Promise.all(Array.from({ length: 19 }, (_, index) => updateDocument(doc.id, stored => {
      stored.slides[index + 1] = { notes: "Appunto", read: true };
    })));
    const summary = (await listDocuments()).find(item => item.id === doc.id)!;
    assert.equal(summary.readPages, 19);
    assert.equal(summary.analyzedPages, 0);
    assert.equal(summary.readPages! / summary.pages, .95);
    await updateDocument(doc.id, stored => { stored.slides[1].read = false; });
    assert.equal((await readDocument(doc.id)).slides[1].notes, "Appunto");
    assert.equal((await listDocuments()).find(item => item.id === doc.id)!.readPages, 18);
    await deleteDocument(doc.id);
  });

  await t.test("rejects path traversal before file access", async () => {
    assert.throws(() => documentDir("../outside"), /Documento non valido/);
    await assert.rejects(readDocument("../../document.json"), /Documento non valido/);
  });
});
