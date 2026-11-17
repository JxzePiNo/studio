import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { retrievePdf, ragMarker, ragText, verifiedRagHits } from "../lib/pdf-rag";
import { ragKey, ragRecord, withRagLease, writeRagRecord, saveRagText, savedRagText } from "../lib/pdf-rag-registry";
import { pdfHash } from "../lib/pdf-content";
import { createDocument, updateSlide } from "../lib/store";
import { POST } from "../app/api/documents/[id]/chat/route";
import { ragProvider } from "./helpers/rag-provider";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { services } from "../lib/firebase-server";
import { memoryFirestore } from "./helpers/memory-firestore";

async function environment(t: import("node:test").TestContext) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pdf-rag-"));
  const previous = { data: process.env.DATA_DIR, enabled: process.env.NEXT_PUBLIC_FIREBASE_ENABLED, key: process.env.OPENAI_API_KEY, fetch: globalThis.fetch };
  process.env.DATA_DIR = directory; process.env.NEXT_PUBLIC_FIREBASE_ENABLED = "false"; process.env.OPENAI_API_KEY = "rag-test-no-network";
  t.after(async () => {
    globalThis.fetch = previous.fetch;
    for (const [key, value] of Object.entries({ DATA_DIR: previous.data, NEXT_PUBLIC_FIREBASE_ENABLED: previous.enabled, OPENAI_API_KEY: previous.key })) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}
async function pdfBytes(pages = 1) {
  const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let number = 1; number <= pages; number++) {
    const page = pdf.addPage();
    if (number === pages) page.drawText("L'entropia misura il numero di stati accessibili del sistema.", { x: 30, y: 500, size: 12, font });
  }
  return pdf.save();
}

test("RAG markers cannot forge pages, evidence or file ownership; full text includes late pages", () => {
  const phrase = "Un fatto verificabile nel documento originale.";
  const index = { totalPages: 1000, complete: true, pages: { 1: "Testo iniziale ".repeat(160000), 1000: phrase } };
  assert.ok(ragText(index).endsWith(`${ragMarker(1000)}\n${phrase}\n`));
  const result = { file_id: "file_ours", score: 0.8, content: [{ type: "text", text: `${ragMarker(1000)}\n${phrase}` }] };
  assert.equal(verifiedRagHits(index, [result], "file_ours")[0].page, 1000);
  assert.deepEqual(verifiedRagHits(index, [result], "file_other"), []);
  assert.deepEqual(verifiedRagHits(index, [result], "file_ours", [1]), []);
  assert.deepEqual(verifiedRagHits(index, [{ ...result, content: [{ type: "text", text: `${ragMarker(1)}\n${phrase}` }] }], "file_ours"), []);
});

test("identical PDFs share a persistent OpenAI index; expired stores rebuild without full-PDF fallback", async t => {
  await environment(t);
  const provider = ragProvider();
  globalThis.fetch = provider.wrap(async () => { throw new Error("No model call expected"); });
  const bytes = await pdfBytes();
  const results = await Promise.all([retrievePdf(bytes, "entropia"), retrievePdf(Uint8Array.from(bytes), "stati")]);
  assert.ok(results.every(result => result.hits.some(hit => hit.page === 1)));
  assert.equal(provider.calls.filter(call => call.url.endsWith("/files")).length, 1);
  await retrievePdf(bytes, "sistema");
  assert.equal(provider.calls.filter(call => call.url.endsWith("/files")).length, 1);
  const record = await ragRecord(ragKey(pdfHash(bytes)));
  assert.equal(record.ready, true);
  assert.equal(record.usageBytes, 1024);
  provider.stores.clear();
  const rebuilt = await Promise.all([retrievePdf(bytes, "entropia"), retrievePdf(bytes, "sistema")]);
  assert.ok(rebuilt.every(result => result.hits.length));
  assert.equal(provider.calls.filter(call => call.url.endsWith("/files")).length, 2);
});

test("interrupted indexing resumes the uploaded file and local leases serialize writes", async t => {
  await environment(t);
  const provider = ragProvider(), fetch = provider.wrap(async () => { throw new Error("No model call expected"); });
  let fail = true;
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith("/vector_stores") && fail) { fail = false; return Response.json({ error: { message: "Temporary failure" } }, { status: 503 }); }
    return fetch(url, init);
  };
  const bytes = await pdfBytes();
  await assert.rejects(retrievePdf(bytes, "entropia"));
  assert.ok((await retrievePdf(bytes, "entropia")).hits.length);
  assert.equal(provider.calls.filter(call => call.url.endsWith("/files")).length, 1, "a retry resumes the provider file checkpoint");
  let active = 0, maximum = 0;
  await Promise.all([1, 2].map(() => withRagLease("lease-test", async () => {
    active++; maximum = Math.max(maximum, active);
    await writeRagRecord("lease-test", { ready: true }); active--;
  })));
  assert.equal(maximum, 1);
});

test("strict document chat retrieves page 1000 and sends only that original page to the answer model", async t => {
  await environment(t);
  const bytes = await pdfBytes(1000), doc = await createDocument("Privato.pdf", bytes, 1000);
  await updateSlide(doc.id, 1, () => ({ notes: "PRIVATE_NOTES", chat: [{ role: "assistant", content: "PRIVATE_ANSWER" }] }));
  const provider = ragProvider();
  let calls = 0;
  globalThis.fetch = provider.wrap(async (_url, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    const text = JSON.stringify(body.input);
    assert.ok(text.includes("1000") && text.includes("entropia"));
    const files = body.input[0].content.filter((part: { type: string }) => part.type === "input_file");
    assert.equal(files.length, 1);
    assert.equal((await PDFDocument.load(Buffer.from(files[0].file_data.split(",")[1], "base64"))).getPageCount(), 1, "the other 999 pages are excluded");
    assert.ok(!text.includes("PRIVATE_NOTES") && !text.includes("PRIVATE_ANSWER"));
    assert.ok(text.length < 40000);
    return Response.json({ id: "resp_rag", status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify({ verdict: "open", segments: [{ kind: "markdown", content: "L'entropia riguarda gli stati accessibili." }], support: 0.8, evidence: [{ sourceId: "P1000_B1" }] }), annotations: [] }] }] });
  });
  const response = await POST(new Request(`http://localhost/api/documents/${doc.id}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page: 1, scope: "document", question: "Cosa misura l'entropia?", pdfOnly: true, vectorStoreId: "vs_other_user" }) }), { params: Promise.resolve({ id: doc.id }) });
  assert.equal(response.status, 200);
  const savedAnswer = (await response.json()).at(-1);
  assert.match(savedAnswer.content, /pagine 1000/);
  assert.ok(savedAnswer.retrieval.some((passage: { page: number; documentId: string; text: string }) => passage.page === 1000 && passage.documentId === doc.id && passage.text.includes("entropia")));
  assert.equal(calls, 1);
  assert.ok([...provider.files.values()].every(text => !text.includes("PRIVATE") && !text.includes("Privato.pdf")));
});

test("cloud registry leases serialize instances and persist page text outside Firestore documents", async () => {
  const enabled = process.env.NEXT_PUBLIC_FIREBASE_ENABLED;
  process.env.NEXT_PUBLIC_FIREBASE_ENABLED = "true";
  const app = initializeApp({ projectId: "rag-test", storageBucket: "rag-test.appspot.com" }, "margine-server");
  const { db, bucket } = services(), memory = memoryFirestore();
  const original = { collection: db.collection, transaction: db.runTransaction };
  const prototype = Object.getPrototypeOf(bucket), originalFile = prototype.file;
  const objects = new Map<string, string>();
  prototype.file = (name: string) => ({
    save: async (text: string) => { objects.set(name, text); },
    download: async () => { const text = objects.get(name); if (text === undefined) throw Object.assign(new Error("Missing"), { code: 404 }); return [Buffer.from(text)]; },
  });
  db.collection = memory.collection.bind(memory); db.runTransaction = memory.runTransaction.bind(memory) as typeof db.runTransaction;
  try {
    const text = { totalPages: 1000, complete: true, pages: { 1000: "Un testo alla fine del documento." } };
    assert.equal(await savedRagText("cloud-test"), undefined);
    await saveRagText("cloud-test", text);
    assert.deepEqual(await savedRagText("cloud-test"), text);
    let active = 0, maximum = 0;
    await Promise.all([1, 2].map(() => withRagLease("cloud-test", async () => {
      active++; maximum = Math.max(maximum, active);
      const current = await ragRecord("cloud-test");
      await writeRagRecord("cloud-test", { ...current, ready: true, vectorStoreId: "vs_shared" });
      active--;
    })));
    assert.equal(maximum, 1);
    assert.equal((await ragRecord("cloud-test")).leaseUntil, 0);
    assert.equal((await ragRecord("cloud-test")).vectorStoreId, "vs_shared");
  } finally {
    prototype.file = originalFile; db.collection = original.collection; db.runTransaction = original.transaction;
    await deleteApp(app);
    if (enabled === undefined) delete process.env.NEXT_PUBLIC_FIREBASE_ENABLED; else process.env.NEXT_PUBLIC_FIREBASE_ENABLED = enabled;
  }
});
