import test from "node:test";
import assert from "node:assert/strict";
import { directUpload } from "../lib/direct-upload";
import type { StudyDocument } from "../lib/types";

test("large uploads send only metadata through the API and bytes directly to storage", async () => {
  const file = new File([new Uint8Array(18 * 1024 * 1024)], "Bishop.pdf", { type: "application/pdf" });
  const calls: string[] = [];
  const saved = { id: "document", name: file.name } as StudyDocument;
  const result = await directUpload(file, "course", async <T>(url: string, init: RequestInit) => {
    assert.equal(url, "/api/documents/upload");
    assert.ok(String(init.body).length < 1000);
    const body = JSON.parse(String(init.body));
    calls.push(body.action);
    if (body.action === "start") {
      assert.equal(body.size, file.size); assert.equal(body.folderId, "course");
      return { uploadId: "session", uploadUrl: "https://storage.googleapis.com/session", contentType: file.type } as T;
    }
    assert.equal(body.uploadId, "session");
    return saved as T;
  }, async (url, init) => {
    calls.push("transfer");
    assert.equal(url, "https://storage.googleapis.com/session");
    assert.equal(init?.method, "PUT"); assert.equal(init?.body, file);
    assert.equal(new Headers(init?.headers).has("authorization"), false);
    return new Response("", { status: 200 });
  });
  assert.equal(result, saved);
  assert.deepEqual(calls, ["start", "transfer", "complete"]);
});

test("a failed storage transfer is never finalized as a document", async () => {
  let metadataCalls = 0;
  await assert.rejects(directUpload(new File(["bytes"], "foto.jpg"), "course", async <T>() => {
    metadataCalls++;
    return { uploadId: "session", uploadUrl: "https://storage.googleapis.com/session", contentType: "image/jpeg" } as T;
  }, async () => new Response("", { status: 500 })), /storage.*HTTP 500/);
  assert.equal(metadataCalls, 1);
});
