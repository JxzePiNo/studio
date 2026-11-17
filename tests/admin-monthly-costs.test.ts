import test from "node:test";
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { services } from "../lib/firebase-server";
import { currentCostMonth, emptyMonthlyUser, addMonthlyEvent } from "../lib/admin-monthly-costs";
import { GET } from "../app/api/admin/monthly-costs/route";
import type { UsageEvent } from "../lib/admin-types";

const event: UsageEvent = { id: "evt", model: "gpt-4.1-mini", feature: "chat", input: 1000000, cached: 0, output: 0, total: 1000000, measured: true, status: "completed", durationMs: 100, at: "2026-11-01T00:00:00.000Z" };

test("current cost month respects Italian month boundaries, year rollover and daylight saving", () => {
  assert.equal(currentCostMonth(new Date("2026-11-17T12:00:00Z")).start, "2026-10-31T23:00:00.000Z");
  assert.equal(currentCostMonth(new Date("2026-08-10T12:00:00Z")).start, "2026-07-31T22:00:00.000Z");
  assert.equal(currentCostMonth(new Date("2026-12-31T23:30:00Z")).month, "2027-01");
  assert.equal(currentCostMonth(new Date("2026-10-31T23:00:00Z")).month, "2026-11");
  assert.equal(currentCostMonth(new Date("2026-03-30T10:00:00Z")).start, "2026-02-28T23:00:00.000Z");
});

test("monthly cost excludes previous months/future events and keeps partial costs explicit", () => {
  const period = currentCostMonth(new Date("2026-11-17T12:00:00Z"));
  let row = emptyMonthlyUser({ uid: "student", name: "Studente", email: "a@example.com" });
  assert.equal(addMonthlyEvent(row, { ...event, at: "2026-10-31T22:59:59.999Z" }, {}, period).calls, 0);
  assert.equal(addMonthlyEvent(row, { ...event, at: period.end }, {}, period).calls, 0);
  row = addMonthlyEvent(row, { ...event, at: period.start }, {}, period);
  assert.equal(row.usd, 0.4);
  row = addMonthlyEvent(row, { ...event, model: "unknown" }, {}, period);
  assert.equal(row.usd, 0.4); assert.equal(row.complete, false); assert.equal(row.unpricedCalls, 1);
  assert.equal(row.calls, 2);
});

test("monthly admin report authenticates, paginates every user's events and never uses lifetime totals", async () => {
  const previous = process.env.NEXT_PUBLIC_FIREBASE_ENABLED;
  process.env.NEXT_PUBLIC_FIREBASE_ENABLED = "false";
  assert.equal((await GET(new Request("http://127.0.0.1/api/admin/monthly-costs"))).status, 403);
  process.env.NEXT_PUBLIC_FIREBASE_ENABLED = "true";
  const app = initializeApp({ projectId: "monthly-test", storageBucket: "monthly-test.appspot.com" }, "margine-server");
  const { auth, db } = services();
  const original = { verify: auth.verifyIdToken, list: auth.listUsers, collection: db.collection };
  let userPages = 0, eventPages = 0;
  auth.verifyIdToken = (async () => ({ uid: "admin", email: "paolucciacopo@gmail.com", email_verified: true })) as unknown as typeof auth.verifyIdToken;
  auth.listUsers = (async (_limit, next) => {
    userPages++;
    return { users: [{ uid: next ? "empty" : "student", displayName: "Test", email: next ? "empty@example.com" : "student@example.com" }], ...(next ? {} : { pageToken: "page2" }) };
  }) as typeof auth.listUsers;
  const period = currentCostMonth();
  const at = new Date(Date.parse(period.start) + 1).toISOString();
  const events = Array.from({ length: 501 }, (_, index) => ({ id: String(index), data: () => ({ ...event, at }) }));
  db.collection = ((name: string) => {
    if (name === "appSettings") return { doc: () => ({ get: async () => ({ exists: false }) }) };
    assert.equal(name, "users");
    return { doc: (uid: string) => ({ collection: (child: string) => {
      assert.equal(child, "usageEvents");
      let offset = 0;
      const query = {
        where(field: string, operator: string, value: string) { assert.equal(field, "at"); assert.ok([">=", "<"].includes(operator)); if (operator === ">=") assert.equal(value, period.start); return query; },
        orderBy(field: string) { assert.equal(field, "at"); return query; },
        limit(count: number) { assert.equal(count, 500); return query; },
        startAfter(doc: { id: string }) { offset = Number(doc.id) + 1; return query; },
        async get() { eventPages++; const docs = uid === "empty" ? [] : events.slice(offset, offset + 500); return { docs, size: docs.length }; },
      };
      return query;
    } }) };
  }) as unknown as typeof db.collection;
  try {
    const response = await GET(new Request("http://127.0.0.1/api/admin/monthly-costs", { headers: { authorization: "Bearer test" } }));
    assert.equal(response.status, 200);
    assert.match(response.headers.get("Cache-Control")!, /private, no-store/);
    const report = await response.json();
    assert.equal(report.month, period.month); assert.equal(userPages, 2); assert.equal(eventPages, 3);
    assert.equal(report.users[0].calls, 501); assert.ok(Math.abs(report.usd - 200.4) < 1e-8);
    assert.equal(report.users[1].usd, 0); assert.equal(report.users[1].calls, 0);
  } finally {
    auth.verifyIdToken = original.verify; auth.listUsers = original.list; db.collection = original.collection;
    await deleteApp(app);
    if (previous === undefined) delete process.env.NEXT_PUBLIC_FIREBASE_ENABLED; else process.env.NEXT_PUBLIC_FIREBASE_ENABLED = previous;
  }
});
