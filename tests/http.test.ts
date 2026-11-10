import { test } from "node:test";
import assert from "node:assert/strict";
import { localRequest, requestGuard } from "../lib/http";
test("allows browser loopback origin when Next normalizes its internal URL", () => {
  const request = new Request("http://localhost:3030/api/documents", { headers: { host: "127.0.0.1:3030", origin: "http://127.0.0.1:3030", "sec-fetch-site": "same-origin" } });
  assert.equal(localRequest(request), undefined);
});

test("invalid server credentials return a configuration error instead of asking for a new login", async () => {
  const values: Record<string, string> = {
    NEXT_PUBLIC_FIREBASE_ENABLED: "true",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: "test-project",
    FIREBASE_CLIENT_EMAIL: "test@test-project.iam.gserviceaccount.com",
    FIREBASE_PRIVATE_KEY: "invalid-test-private-key",
  };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  const originalError = console.error;
  const logs: unknown[][] = [];
  Object.assign(process.env, values);
  console.error = (...args: unknown[]) => { logs.push(args); };
  try {
    const response = await requestGuard(new Request("https://studio.example/api/profile", { headers: { authorization: "Bearer fake-test-token" } }));
    assert.equal(response?.status, 503);
    assert.match((await response!.json()).error, /Configurazione Firebase/);
    const logged = JSON.stringify(logs);
    assert.ok(logged.includes("initialize"));
    assert.ok(!logged.includes("invalid-test-private-key"));
    assert.ok(!logged.includes("fake-test-token"));
  } finally {
    console.error = originalError;
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
test("rejects external hosts, cross-site requests, and different origins", () => {
  const cases: Record<string, string>[] = [{ host: "attacker.example" }, { origin: "https://attacker.example" }, { "sec-fetch-site": "cross-site" }, { host: "127.0.0.1:3030", origin: "http://localhost:3030" }];
  for (const headers of cases) {
    assert.equal(localRequest(new Request("http://localhost:3030/api/documents", { headers }))?.status, 403);
  }
});
