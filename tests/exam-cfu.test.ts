import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { POST } from "../app/api/folders/route";
import { PATCH } from "../app/api/folders/[id]/route";
import { listFolders } from "../lib/folders";

test("optional CFU survive creation and updates, clear explicitly, and reject invalid values", async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "studio-exam-cfu-"));
  const previous = { data: process.env.DATA_DIR, enabled: process.env.NEXT_PUBLIC_FIREBASE_ENABLED };
  process.env.DATA_DIR = directory;
  process.env.NEXT_PUBLIC_FIREBASE_ENABLED = "false";
  t.after(async () => {
    for (const [key, value] of Object.entries({ DATA_DIR: previous.data, NEXT_PUBLIC_FIREBASE_ENABLED: previous.enabled })) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await rm(directory, { recursive: true, force: true });
  });
  function request(method: string, data: unknown, id = "") {
    return new Request(`http://127.0.0.1/api/folders${id ? `/${id}` : ""}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  }
  const response = await POST(request("POST", { name: "Fisica", cfu: 6.5 }));
  assert.equal(response.status, 201);
  const folder = await response.json();
  assert.equal(folder.cfu, 6.5);
  assert.equal((await listFolders())[0].cfu, 6.5);
  const update = (data: unknown) => PATCH(request("PATCH", data, folder.id), { params: Promise.resolve({ id: folder.id }) });
  for (const cfu of [0, -1, 120.5, 6.25, "6", null]) {
    assert.equal((await POST(request("POST", { name: "Invalid", cfu }))).status, 400);
    if (cfu !== null) assert.equal((await update({ cfu })).status, 400);
  }
  assert.equal((await update({ cfu: 120 })).status, 200);
  assert.equal((await listFolders())[0].cfu, 120);
  await update({ name: "Fisica aggiornata" });
  assert.equal((await listFolders())[0].cfu, 120);
  assert.equal((await update({ cfu: null })).status, 200);
  assert.equal(Object.hasOwn((await listFolders())[0], "cfu"), false);
  const withoutCfu = await POST(request("POST", { name: "Analisi" }));
  assert.equal(withoutCfu.status, 201);
  assert.equal(Object.hasOwn(await withoutCfu.json(), "cfu"), false);
});
