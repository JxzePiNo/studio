import { test } from "node:test";
import assert from "node:assert/strict";
import { localRequest } from "../lib/http";
test("allows browser loopback origin when Next normalizes its internal URL", () => {
  const request = new Request("http://localhost:3030/api/documents", { headers: { host: "127.0.0.1:3030", origin: "http://127.0.0.1:3030", "sec-fetch-site": "same-origin" } });
  assert.equal(localRequest(request), undefined);
});
test("rejects external hosts, cross-site requests, and different origins", () => {
  const cases: Record<string, string>[] = [{ host: "attacker.example" }, { origin: "https://attacker.example" }, { "sec-fetch-site": "cross-site" }, { host: "127.0.0.1:3030", origin: "http://localhost:3030" }];
  for (const headers of cases) {
    assert.equal(localRequest(new Request("http://localhost:3030/api/documents", { headers }))?.status, 403);
  }
});
