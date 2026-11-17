import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { fingerprintFile } from "../lib/pdf-fingerprint";
import { pdfHash, possessionProof, validPossession, validPossessionStream, storePdfBlob, retainPdfBlob, releasePdfBlob } from "../lib/pdf-content";
import { directUpload } from "../lib/direct-upload";
import { createDocument, deleteDocument, readPdf, documentDir } from "../lib/store";
import { analysisOnlySlide } from "../lib/reusable-analysis";
import { analysisKey, sharedAnalysis } from "../lib/shared-analysis-cache";
import { services } from "../lib/firebase-server";
import { memoryFirestore } from "./helpers/memory-firestore";
import type { Explanation, StudyDocument } from "../lib/types";

const explanation: Explanation = { pageKind: "content", title: "Formula", language: "it", overview: "Una spiegazione", concepts: [], glossary: [], example: "", takeaway: "" };

test("fingerprints compare full bytes, ignore filenames and require a nonce-bound proof", async () => {
  const bytes = new Uint8Array(5 * 1024 * 1024); bytes[bytes.length - 1] = 42;
  const file = new File([bytes], "a.pdf");
  assert.equal(await fingerprintFile(file), pdfHash(bytes));
  assert.equal(await fingerprintFile(new File([bytes], "rinominato.pdf")), pdfHash(bytes));
  const proof = await fingerprintFile(file, "random-challenge");
  assert.equal(proof, possessionProof(bytes, "random-challenge"));
  assert.ok(validPossession(bytes, "random-challenge", proof));
  async function* chunks() { yield bytes.subarray(0, 100); yield bytes.subarray(100); }
  assert.ok(await validPossessionStream(chunks(), "random-challenge", proof, bytes.length));
  assert.ok(!await validPossessionStream(chunks(), "random-challenge", proof, bytes.length - 1));
  assert.ok(!validPossession(bytes, "another-challenge", proof));
  assert.ok(!validPossession(bytes, "random-challenge", pdfHash(bytes)));
  bytes[bytes.length - 1] = 43;
  assert.ok(!validPossession(bytes, "random-challenge", proof));
});

test("a known PDF completes without transferring bytes, with proof verified by the server", async () => {
  const file = new File(["%PDF-existing"], "rinominato.pdf");
  const document = { id: randomUUID() } as StudyDocument;
  const actions: string[] = [];
  const result = await directUpload(file, "course", async <T>(_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)); actions.push(body.action);
    if (body.action === "start") { assert.equal(body.hash, pdfHash(new Uint8Array(await file.arrayBuffer()))); return { uploadId: "id", nonce: "server-nonce" } as T; }
    assert.equal(body.action, "reuse");
    assert.ok(validPossession(new Uint8Array(await file.arrayBuffer()), "server-nonce", body.proof));
    return document as T;
  }, async () => { throw new Error("No transfer expected"); });
  assert.equal(result, document); assert.deepEqual(actions, ["start", "reuse"]);
});

test("an expired reusable blob transparently falls back to a normal verified upload", async () => {
  const file = new File(["%PDF-existing"], "a.pdf");
  const actions: string[] = [];
  const saved = { id: randomUUID() } as StudyDocument;
  await directUpload(file, "course", async <T>(_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)); actions.push(body.action);
    if (body.action === "reuse") throw Object.assign(new Error("Expired"), { status: 409 });
    if (body.action === "complete") return saved as T;
    return (body.skipReuse ? { uploadId: "new", uploadUrl: "https://storage.test", contentType: "application/pdf" } : { uploadId: "old", nonce: "nonce" }) as T;
  }, async () => { actions.push("transfer"); return new Response("", { status: 200 }); });
  assert.deepEqual(actions, ["start", "reuse", "start", "transfer", "complete"]);
});

test("local duplicates share one binary and deleting one copy does not break another", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pdf-blobs-"));
  const previous = { data: process.env.DATA_DIR, enabled: process.env.NEXT_PUBLIC_FIREBASE_ENABLED };
  process.env.DATA_DIR = directory; process.env.NEXT_PUBLIC_FIREBASE_ENABLED = "false";
  try {
    const bytes = new Uint8Array([1, 2, 3]);
    const [first, second] = await Promise.all([createDocument("a.pdf", bytes, 1), createDocument("renamed.pdf", bytes, 1)]);
    assert.equal(first.contentHash, second.contentHash);
    assert.equal((await stat(path.join(documentDir(first.id), "original.pdf"))).ino, (await stat(path.join(documentDir(second.id), "original.pdf"))).ino);
    await deleteDocument(first.id);
    assert.deepEqual([...await readPdf(second.id)], [...bytes]);
    await deleteDocument(second.id);
    assert.deepEqual(await readdir(path.join(directory, ".pdf-content")), []);
  } finally {
    if (previous.data === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = previous.data;
    if (previous.enabled === undefined) delete process.env.NEXT_PUBLIC_FIREBASE_ENABLED; else process.env.NEXT_PUBLIC_FIREBASE_ENABLED = previous.enabled;
    await rm(directory, { recursive: true, force: true });
  }
});

test("reusable analysis never contains another student's notes, chat or reading progress", () => {
  const clean = analysisOnlySlide({ explanation, generatedAt: "today", notes: "private notes", read: true, chat: [{ role: "user", content: "private question" }] });
  assert.deepEqual(clean, { notes: "", explanation, generatedAt: "today" });
});

test("cloud cache coalesces generation and content blobs survive until the last private reference is deleted", async () => {
  const previous = process.env.NEXT_PUBLIC_FIREBASE_ENABLED;
  process.env.NEXT_PUBLIC_FIREBASE_ENABLED = "true";
  const app = initializeApp({ projectId: "reuse-test", storageBucket: "reuse-test.appspot.com" }, "margine-server");
  const { db, bucket } = services(), memory = memoryFirestore();
  const original = { collection: db.collection, transaction: db.runTransaction };
  const prototype = Object.getPrototypeOf(bucket), fileMethod = prototype.file;
  const objects = new Map<string, Buffer>(); let writes = 0;
  prototype.file = (name: string) => ({ exists: async () => [objects.has(name)], save: async (bytes: Buffer) => { if (objects.has(name)) throw Object.assign(new Error("Exists"), { code: 412 }); objects.set(name, bytes); writes++; }, delete: async () => { objects.delete(name); } });
  db.collection = memory.collection.bind(memory); db.runTransaction = memory.runTransaction.bind(memory) as typeof db.runTransaction;
  try {
    const bytes = new Uint8Array([1, 2, 3]), blob = await storePdfBlob(bytes, 1);
    await storePdfBlob(bytes, 1); assert.equal(writes, 1);
    const ref = db.collection("sharedBlobs").doc(blob.hash);
    await db.runTransaction(async tx => { retainPdfBlob(tx, ref, "users/a/documents/a"); retainPdfBlob(tx, ref, "users/b/documents/b"); });
    await releasePdfBlob(blob.hash, "users/a/documents/a"); assert.ok(objects.has(blob.path));
    await releasePdfBlob(blob.hash, "users/b/documents/b"); assert.ok(!objects.has(blob.path));
    let calls = 0;
    const key = analysisKey(pdfHash(bytes), 1, "model", "prompt-v1", { studyProgram: "Fisica", courseName: "Meccanica" });
    const generate = async () => { calls++; return explanation; };
    const values = await Promise.all(Array.from({ length: 8 }, () => sharedAnalysis(key, generate)));
    assert.equal(calls, 1); assert.ok(values.every(value => value.explanation.title === explanation.title));
    assert.equal((await sharedAnalysis(key, generate)).explanation.pageKind, "content"); assert.equal(calls, 1);
    await sharedAnalysis(key, generate, true); assert.equal(calls, 2);
    await assert.rejects(sharedAnalysis(key, async () => { throw new Error("AI failed"); }, true));
    await sharedAnalysis(key, generate); assert.equal(calls, 2, "failed regeneration keeps the previous good result");
    assert.notEqual(key, analysisKey(pdfHash(bytes), 1, "model", "prompt-v2", { studyProgram: "Fisica", courseName: "Meccanica" }));
    assert.notEqual(key, analysisKey(pdfHash(bytes), 1, "model", "prompt-v1", { studyProgram: "Medicina", courseName: "Meccanica" }));
  } finally {
    prototype.file = fileMethod; db.collection = original.collection; db.runTransaction = original.transaction;
    await deleteApp(app);
    if (previous === undefined) delete process.env.NEXT_PUBLIC_FIREBASE_ENABLED; else process.env.NEXT_PUBLIC_FIREBASE_ENABLED = previous;
  }
});
