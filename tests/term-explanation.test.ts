import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import type { Root, Element } from "hast";
import { POST } from "../app/api/documents/[id]/term/route";
import { createDocument, readDocument, updateDocument } from "../lib/store";
import { annotateTerms } from "../lib/markdown-notes";

test("term clarifications neither send conversation memory nor change document history", async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "studio-term-"));
  const previous = { data: process.env.DATA_DIR, enabled: process.env.NEXT_PUBLIC_FIREBASE_ENABLED, key: process.env.OPENAI_API_KEY, fetch: globalThis.fetch };
  process.env.DATA_DIR = directory; process.env.NEXT_PUBLIC_FIREBASE_ENABLED = "false"; process.env.OPENAI_API_KEY = "fake-no-network";
  t.after(async () => {
    globalThis.fetch = previous.fetch;
    for (const [key, value] of Object.entries({ DATA_DIR: previous.data, NEXT_PUBLIC_FIREBASE_ENABLED: previous.enabled, OPENAI_API_KEY: previous.key })) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await rm(directory, { recursive: true, force: true });
  });
  const pdf = await PDFDocument.create(); pdf.addPage();
  const doc = await createDocument("Termini.pdf", await pdf.save(), 1);
  await updateDocument(doc.id, d => { d.slides[1] = { notes: "Appunti privati", chat: [{ role: "user", content: "CRONOLOGIA DA NON INVIARE" }] }; });
  const before = await readDocument(doc.id);
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    calls++;
    const body = JSON.parse(String(options?.body));
    assert.equal(body.store, false);
    assert.ok(!JSON.stringify(body).includes("CRONOLOGIA DA NON INVIARE"));
    assert.ok(!JSON.stringify(body).includes("Appunti privati"));
    assert.ok(body.input.includes("entropia"));
    return Response.json({ id: "term", status: "completed", output_text: "Una misura degli stati accessibili.", output: [] });
  };
  const ask = (page = 1, term = "entropia") => POST(new Request(`http://127.0.0.1/api/documents/${doc.id}/term`, { method: "POST", body: JSON.stringify({ page, term, context: "L'entropia misura gli stati accessibili." }) }), { params: Promise.resolve({ id: doc.id }) });
  const response = await ask();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { explanation: "Una misura degli stati accessibili." });
  assert.deepEqual(await readDocument(doc.id), before);
  assert.equal((await ask(2)).status, 400);
  assert.equal((await ask(1, "x".repeat(161))).status, 400);
  assert.equal(calls, 1);
});

test("term chips annotate text while preserving formulas, code and links", () => {
  const element = (tagName: string, className?: string): Element => ({ type: "element", tagName, properties: className ? { className: [className] } : {}, children: [{ type: "text", value: "entropia" }] });
  const tree: Root = { type: "root", children: [element("p"), element("code"), element("a"), element("span", "katex")] };
  const before = structuredClone(tree.children.slice(1));
  annotateTerms(tree, [{ id: "note", term: "entropia" }]);
  assert.equal(((tree.children[0] as Element).children[0] as Element).properties["data-note-id"], "note");
  assert.deepEqual(tree.children.slice(1), before);
});
