import test from "node:test";
import assert from "node:assert/strict";
import { uploadTransfer } from "../lib/upload-transfer";

test("upload progress follows browser byte events and separates transfer completion from server response", async t => {
  const original = globalThis.XMLHttpRequest;
  let instance: FakeXHR;
  class FakeXHR {
    upload: { onprogress?: (event: unknown) => void; onload?: () => void } = {};
    status = 200; responseText = '{"id":"saved"}'; responseURL = "http://127.0.0.1/api/documents";
    onload?: () => void; onabort?: () => void; onerror?: () => void; timeout = 0;
    headers: Record<string, string> = {};
    constructor() { instance = this; }
    open(method: string, url: string) { assert.equal(method, "POST"); assert.equal(url, "/api/documents"); }
    setRequestHeader(key: string, value: string) { this.headers[key] = value; }
    getResponseHeader() { return "application/json"; }
    send() {}
    abort() { this.onabort?.(); }
  }
  globalThis.XMLHttpRequest = FakeXHR as unknown as typeof XMLHttpRequest;
  t.after(() => { globalThis.XMLHttpRequest = original; });
  const states: (number | string)[] = [], abort = new AbortController();
  const response = uploadTransfer("/api/documents", { body: new FormData(), signal: abort.signal, onProgress: fraction => states.push(fraction), onSent: () => states.push("processing") });
  instance!.upload.onprogress!({ lengthComputable: false, loaded: 3, total: 0 });
  assert.deepEqual(states, []);
  instance!.upload.onprogress!({ lengthComputable: true, loaded: 3, total: 10 });
  assert.deepEqual(states, [0.3]);
  instance!.upload.onload!(); assert.deepEqual(states, [0.3, 1, "processing"]);
  let settled = false; void response.then(() => { settled = true; });
  await Promise.resolve(); assert.equal(settled, false);
  instance!.onload!(); assert.deepEqual(await (await response).json(), { id: "saved" });
  const cancelled = uploadTransfer("/api/documents", { body: new FormData(), signal: abort.signal, onProgress: () => {}, onSent: () => {} });
  abort.abort(); await assert.rejects(cancelled, { name: "AbortError" });
  await assert.rejects(uploadTransfer("/api/documents", { body: new FormData(), signal: abort.signal, onProgress: () => {}, onSent: () => {} }), { name: "AbortError" });
});
