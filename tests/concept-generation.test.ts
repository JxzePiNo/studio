import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { POST, PATCH } from "../app/api/documents/[id]/visualizations/route";
import { createDocument, readDocument } from "../lib/store";
import { createFolder } from "../lib/folders";
import { saveStudyProfile } from "../lib/study-profile";
import { heartMap } from "../lib/artifact-example";
import { GET as imageGET } from "../app/api/documents/[id]/visualizations/[assetId]/image/route";

test("material generation uses PDF scope and course, persists and edits a map, rejects invalid output", async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "studio-model-"));
  const previous = { data: process.env.DATA_DIR, enabled: process.env.NEXT_PUBLIC_FIREBASE_ENABLED, key: process.env.OPENAI_API_KEY, fetch: globalThis.fetch };
  process.env.DATA_DIR = directory; process.env.NEXT_PUBLIC_FIREBASE_ENABLED = "false"; process.env.OPENAI_API_KEY = "fake-key-no-network";
  t.after(async () => {
    globalThis.fetch = previous.fetch;
    for (const [key, value] of Object.entries({ DATA_DIR: previous.data, NEXT_PUBLIC_FIREBASE_ENABLED: previous.enabled, OPENAI_API_KEY: previous.key })) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await rm(directory, { recursive: true, force: true });
  });
  const folder = await createFolder("Fisiologia");
  await saveStudyProfile({ studyProgram: "Medicina", onboardingCompleted: true });
  const pdf = await PDFDocument.create(); pdf.addPage(); pdf.addPage();
  const doc = await createDocument("Cuore.pdf", await pdf.save(), 2, folder.id);
  let expectedPages = 1; let invalid = false; let invalidPage = false;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(String(options?.body));
    assert.equal(body.store, false); assert.equal(body.text.format.strict, true);
    const content = body.input[0].content;
    const text = content.find((part: { type: string }) => part.type === "input_text").text;
    assert.ok(text.includes("Medicina")); assert.ok(text.includes("Fisiologia")); assert.ok(text.includes("Mostra le valvole"));
    if (expectedPages === 2) assert.ok(text.includes("Mostra le valvole"));
    const file = content.find((part: { type: string }) => part.type === "input_file");
    assert.equal((await PDFDocument.load(Buffer.from(file.file_data.split(",")[1], "base64"))).getPageCount(), expectedPages);
    const { id: _id, kind: _kind, layout: _layout, ...model } = heartMap;
    model.nodes = model.nodes.map((node, index) => ({ ...node, sourcePage: index === 0 ? null : invalidPage ? 99 : expectedPages }));
    if (invalid) model.nodes = [model.nodes[0], model.nodes[0]];
    return Response.json({ id: "response_model", object: "response", status: "completed", output: [{ id: "msg_model", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(model), annotations: [] }] }] });
  };
  const ask = (scope = "slide", page = 1) => POST(new Request(`http://127.0.0.1/api/documents/${doc.id}/visualizations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page, question: "Mostra le valvole", scope, kind: "map" }) }), { params: Promise.resolve({ id: doc.id }) });
  const response = await ask(); assert.equal(response.status, 200);
  const messages = await response.json(); assert.equal(messages.length, 2); assert.equal(messages[1].artifact.nodes.length, 10);
  assert.notEqual(messages[1].artifact.id, heartMap.id);
  assert.deepEqual((await readDocument(doc.id)).slides[1].chat, messages);
  const artifact = { ...messages[1].artifact, title: "Cuore modificato" };
  const edit = (value: unknown) => PATCH(new Request(`http://127.0.0.1/api/documents/${doc.id}/visualizations`, { method: "PATCH", body: JSON.stringify({ page: 1, artifact: value }) }), { params: Promise.resolve({ id: doc.id }) });
  assert.equal((await edit(artifact)).status, 200);
  assert.equal((await readDocument(doc.id)).slides[1].chat?.[1].artifact?.title, artifact.title);
  assert.equal((await edit({ ...artifact, id: heartMap.id })).status, 404);
  assert.equal((await edit({ ...artifact, nodes: [artifact.nodes[0], artifact.nodes[0]] })).status, 400);
  assert.equal((await edit({ ...artifact, nodes: artifact.nodes.map((node: object) => ({ ...node, sourcePage: 3 })) })).status, 400);
  expectedPages = 2;
  assert.equal((await ask("document")).status, 200);
  invalid = true;
  assert.equal((await ask("document")).status, 502);
  assert.equal((await readDocument(doc.id)).slides[1].chat?.length, 4);
  assert.equal((await ask("slide", 3)).status, 400);
  invalid = false; expectedPages = 1;
  assert.equal((await ask("slide", 2)).status, 200);
  const singlePageMap = (await readDocument(doc.id)).slides[2].chat?.at(-1)?.artifact;
  assert.ok(singlePageMap && singlePageMap.kind !== "image");
  assert.equal(singlePageMap.nodes[0].sourcePage, null);
  assert.equal(singlePageMap.nodes[1].sourcePage, 2, "single-page attachments point to the original physical PDF page");
  invalidPage = true;
  assert.equal((await ask("slide", 2)).status, 502);
  assert.equal((await readDocument(doc.id)).slides[2].chat?.length, 2);
});

test("images use the generated pixels for hotspots, store PNGs outside chat and protect image identity", async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "studio-image-"));
  const previous = { data: process.env.DATA_DIR, enabled: process.env.NEXT_PUBLIC_FIREBASE_ENABLED, key: process.env.OPENAI_API_KEY, fetch: globalThis.fetch };
  process.env.DATA_DIR = directory; process.env.NEXT_PUBLIC_FIREBASE_ENABLED = "false"; process.env.OPENAI_API_KEY = "fake-key-no-network";
  t.after(async () => {
    globalThis.fetch = previous.fetch;
    for (const [key, value] of Object.entries({ DATA_DIR: previous.data, NEXT_PUBLIC_FIREBASE_ENABLED: previous.enabled, OPENAI_API_KEY: previous.key })) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await rm(directory, { recursive: true, force: true });
  });
  const folder = await createFolder("Biologia");
  const pdf = await PDFDocument.create(); pdf.addPage();
  const doc = await createDocument("Cellula.pdf", await pdf.save(), 1, folder.id);
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ3sAAAAASUVORK5CYII=";
  const points = [{ id: "nucleus", label: "Nucleo", description: "Contiene il DNA.", x: 50, y: 45, color: "#ddd6fe" }, { id: "membrane", label: "Membrana", description: "Delimita la cellula.", x: 80, y: 50, color: "#bfdbfe" }];
  let stages = 0;
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(String(options?.body)); stages++;
    if (String(url).includes("images/generations")) { assert.equal(body.output_format, "png"); assert.equal(body.n, 1); return Response.json({ created: 1, data: [{ b64_json: png }] }); }
    const locating = body.text.format.name === "study_image_hotspots";
    if (locating) assert.equal(body.input[0].content[0].image_url, `data:image/png;base64,${png}`);
    const value = locating ? { hotspots: points } : { title: "Cellula animale", summary: "Le parti della cellula.", note: "Illustrazione semplificata.", prompt: "Animal cell illustration, no text." };
    return Response.json({ id: "response_image", object: "response", status: "completed", output: [{ id: "msg_image", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(value), annotations: [] }] }] });
  };
  const response = await POST(new Request(`http://127.0.0.1/api/documents/${doc.id}/visualizations`, { method: "POST", body: JSON.stringify({ page: 1, question: "Una cellula", scope: "slide", kind: "image" }) }), { params: Promise.resolve({ id: doc.id }) });
  assert.equal(response.status, 200); assert.equal(stages, 3);
  const messages = await response.json(), artifact = messages[1].artifact;
  assert.equal(artifact.kind, "image"); assert.deepEqual(artifact.hotspots, points);
  assert.ok(!JSON.stringify(messages).includes(png));
  const params = Promise.resolve({ id: doc.id, assetId: artifact.image.assetId });
  const image = await imageGET(new Request("http://127.0.0.1/image"), { params });
  assert.equal(image.status, 200); assert.equal(image.headers.get("Content-Type"), "image/png");
  assert.equal(Buffer.from(await image.arrayBuffer()).toString("base64"), png);
  const edit = (value: unknown) => PATCH(new Request(`http://127.0.0.1/api/documents/${doc.id}/visualizations`, { method: "PATCH", body: JSON.stringify({ page: 1, artifact: value }) }), { params: Promise.resolve({ id: doc.id }) });
  assert.equal((await edit({ ...artifact, hotspots: points.map(point => ({ ...point, x: point.x + 1 })) })).status, 200);
  assert.equal((await edit({ ...artifact, image: { ...artifact.image, assetId: "55e45850-c145-49a6-b74b-abc2b77d3459" } })).status, 400);
  process.env.NEXT_PUBLIC_FIREBASE_ENABLED = "true";
  assert.equal((await imageGET(new Request("http://127.0.0.1/image"), { params })).status, 401);
  process.env.NEXT_PUBLIC_FIREBASE_ENABLED = "false";
});
