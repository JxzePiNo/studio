import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, unlink, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createFolder, deleteFolder, listFolders, updateFolder } from "../lib/folders";
import { createDocument, readDocument, listDocuments, updateDocument, documentDir } from "../lib/store";
import { requestGuard } from "../lib/http";
import { PATCH } from "../app/api/folders/[id]/route";

test("exam folders survive reload and documents keep folder and per-slide chat", async t => {
  const previous = process.env.DATA_DIR;
  const dir = await mkdtemp(path.join(os.tmpdir(), "margine-folders-"));
  process.env.DATA_DIR = dir;
  t.after(async () => { if (previous === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = previous; await rm(dir, { recursive: true, force: true }); });
  const folder = await createFolder("Analisi matematica");
  assert.deepEqual(await listFolders(), [folder]);
  const doc = await createDocument("Lezione.pdf", new Uint8Array([1]), 2);
  await updateDocument(doc.id, d => { d.folderId = folder.id; d.slides[1] = { notes: "Nota", chat: [{ role: "user", content: "Perché?" }, { role: "assistant", content: "Ecco la spiegazione." }] }; });
  await updateDocument(doc.id, d => { d.slides[1].notes = "Nota aggiornata"; });
  const stored = await readDocument(doc.id);
  assert.equal(stored.folderId, folder.id);
  assert.equal(stored.slides[1].chat?.length, 2);
  assert.equal(stored.slides[2], undefined);
  assert.equal((await listDocuments()).length, 1);
});

test("cloud requests require a bearer token before accessing data", async t => {
  const previous = process.env.NEXT_PUBLIC_FIREBASE_ENABLED;
  process.env.NEXT_PUBLIC_FIREBASE_ENABLED = "true";
  t.after(() => { if (previous === undefined) delete process.env.NEXT_PUBLIC_FIREBASE_ENABLED; else process.env.NEXT_PUBLIC_FIREBASE_ENABLED = previous; });
  assert.equal((await requestGuard(new Request("https://study.example/api/documents", { headers: { host: "study.example" } })))?.status, 401);
  assert.equal((await requestGuard(new Request("https://study.example/api/documents", { headers: { host: "study.example", origin: "https://evil.example" } })))?.status, 403);
});

test("course requirement defaults to required and optional choices survive reloads and other edits", async t => {
  const previous = process.env.DATA_DIR;
  const dir = await mkdtemp(path.join(os.tmpdir(), "margine-course-requirement-"));
  process.env.DATA_DIR = dir;
  t.after(async () => { if (previous === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = previous; await rm(dir, { recursive: true, force: true }); });
  const folder = await createFolder("Fisica");
  assert.equal((await listFolders())[0].optional ?? false, false);
  await updateFolder(folder.id, { optional: true });
  await updateFolder(folder.id, { name: "Fisica applicata" });
  assert.equal((await listFolders())[0].optional, true);
  await updateFolder(folder.id, { optional: false });
  assert.equal((await listFolders())[0].optional, false);
  for (const invalid of ["false", 0, null]) {
    await assert.rejects(updateFolder(folder.id, { optional: invalid as unknown as boolean }), { status: 400 });
    const response = await PATCH(new Request(`http://127.0.0.1/api/folders/${folder.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ optional: invalid }) }), { params: Promise.resolve({ id: folder.id }) });
    assert.equal(response.status, 400);
  }
  const response = await PATCH(new Request(`http://127.0.0.1/api/folders/${folder.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ optional: true }) }), { params: Promise.resolve({ id: folder.id }) });
  assert.equal(response.status, 200);
  assert.equal((await listFolders())[0].optional, true);
  await updateFolder(folder.id, { optional: false });
  assert.equal((await listFolders())[0].optional, false);
});

test("archiving preserves materials; deleting removes only that course and can be retried", async t => {
  const previous = process.env.DATA_DIR;
  const dir = await mkdtemp(path.join(os.tmpdir(), "margine-archive-"));
  process.env.DATA_DIR = dir;
  t.after(async () => { if (previous === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = previous; await rm(dir, { recursive: true, force: true }); });
  const folder = await createFolder("Analisi");
  const other = await createFolder("Fisica");
  const material = await createDocument("Analisi.pdf", new Uint8Array([1]), 1, folder.id);
  const retained = await createDocument("Fisica.pdf", new Uint8Array([2]), 1, other.id);
  assert.equal((await updateFolder(folder.id, { archived: true })).archived, true);
  assert.equal((await readDocument(material.id)).folderId, folder.id);
  assert.equal((await updateFolder(folder.id, { archived: false })).archived, false);
  // Persist the same manifest used after a partially failed course deletion.
  await updateFolder(folder.id, value => { Object.assign(value, { deletionDocumentIds: [material.id] }); });
  await unlink(path.join(documentDir(material.id), "document.json"));
  await stat(path.join(documentDir(material.id), "original.pdf"));
  await deleteFolder(folder.id);
  await assert.rejects(stat(documentDir(material.id)), { code: "ENOENT" });
  assert.deepEqual((await listFolders()).map(value => value.id), [other.id]);
  assert.deepEqual((await listDocuments()).map(value => value.id), [retained.id]);
  await deleteFolder(folder.id);
  await assert.rejects(deleteFolder("../escape"), /Esame non valido/);
});
