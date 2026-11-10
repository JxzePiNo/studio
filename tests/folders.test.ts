import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createFolder, listFolders } from "../lib/folders";
import { createDocument, readDocument, listDocuments, updateDocument } from "../lib/store";
import { requestGuard } from "../lib/http";

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
