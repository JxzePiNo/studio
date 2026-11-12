import test from "node:test";
import assert from "node:assert/strict";
import { billingQuery, costPeriod, firebaseCosts, openaiCosts } from "../lib/admin-costs";

const period = costPeriod(7, new Date("2026-11-12T15:30:00.000Z"));
test("cost periods include today in UTC and missing credentials do not fabricate costs", async () => {
  assert.equal(period.start, "2026-11-06T00:00:00.000Z");
  const openai = await openaiCosts(period, {});
  const firebase = await firebaseCosts(period, {});
  assert.equal(openai.status, "setup"); assert.equal(firebase.status, "setup");
  assert.deepEqual(openai.entries, []); assert.deepEqual(firebase.entries, []);
  assert.equal(openai.updatedAt, null);
});

test("OpenAI costs paginate, use an admin key, filter the configured project and retain currencies", async () => {
  let calls = 0;
  const result = await openaiCosts(period, { OPENAI_ADMIN_KEY: "admin-secret", OPENAI_COSTS_PROJECT_ID: "proj_studio" }, (async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://api.openai.com");
    assert.equal(url.searchParams.get("project_ids[]"), "proj_studio");
    assert.equal(url.searchParams.get("group_by[]"), "line_item");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer admin-secret");
    if (++calls === 2) assert.equal(url.searchParams.get("page"), "next");
    return Response.json({ data: [{ start_time: 1793923200, results: [{ amount: { value: calls === 1 ? 2.5 : 1.25, currency: calls === 1 ? "usd" : "eur" }, line_item: "API tokens" }] }], has_more: calls === 1, next_page: calls === 1 ? "next" : null });
  }) as typeof fetch);
  assert.equal(calls, 2); assert.equal(result.status, "ready");
  assert.deepEqual(result.entries.map(row => [row.currency, row.amount]), [["USD", 2.5], ["EUR", 1.25]]);
  assert.ok(!JSON.stringify(result).includes("admin-secret"));
});

test("OpenAI failures discard partial totals and never expose upstream credentials or errors", async () => {
  let calls = 0;
  const result = await openaiCosts(period, { OPENAI_ADMIN_KEY: "secret" }, (async () => ++calls === 1 ? Response.json({ data: [{ start_time: 1, results: [{ amount: { value: 42, currency: "usd" } }] }], has_more: true, next_page: "more" }) : new Response("secret upstream error", { status: 403 })) as typeof fetch);
  assert.equal(result.status, "error"); assert.deepEqual(result.entries, []);
  assert.ok(!JSON.stringify(result).includes("secret"));
});

test("Firebase billing uses a bounded parameterized query, credits and paginated BigQuery results", async () => {
  const env = { GOOGLE_CLOUD_BILLING_TABLE: "studio-test.billing.gcp_billing_export_v1_ACCOUNT", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "studio-app", GOOGLE_CLOUD_BILLING_LOCATION: "EU" };
  let calls = 0;
  const result = await firebaseCosts(period, env, async (input, init) => {
    calls++;
    if (calls === 1) {
      const query = JSON.parse(String(init.body));
      assert.equal(query.maximumBytesBilled, "1000000000");
      assert.equal(query.location, "EU");
      assert.ok(query.query.includes("UNNEST(credits)"));
      assert.ok(query.query.includes("project.id = @project"));
      assert.ok(!query.query.includes("studio-app"));
      assert.equal(query.queryParameters.find((p: { name: string }) => p.name === "project").parameterValue.value, "studio-app");
      return { jobComplete: false, jobReference: { projectId: "studio-test", jobId: "costs-job", location: "EU" } };
    }
    const url = new URL(input);
    assert.equal(url.searchParams.get("location"), "EU");
    if (calls === 3) assert.equal(url.searchParams.get("pageToken"), "second-page");
    return { jobComplete: true, rows: [{ f: ["2026-11-12", "Cloud Firestore", "EUR", calls === 2 ? "0.125" : "-0.01"].map(v => ({ v })) }], ...(calls === 2 ? { pageToken: "second-page" } : {}) };
  });
  assert.equal(result.status, "ready"); assert.equal(calls, 3);
  assert.deepEqual(result.entries.map(row => row.amount), [0.125, -0.01]);
  assert.throws(() => billingQuery("studio-test.billing.table`; DROP TABLE x; --"));
});

test("Firebase errors remain isolated and never turn a failed connection into zero spend", async () => {
  const result = await firebaseCosts(period, { GOOGLE_CLOUD_BILLING_TABLE: "studio-test.billing.gcp_billing_export_v1_ACCOUNT", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "studio-app" }, async () => { throw new Error("private secret"); });
  assert.equal(result.status, "error"); assert.deepEqual(result.entries, []);
  assert.ok(!JSON.stringify(result).includes("private secret"));
});
