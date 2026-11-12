import test from "node:test";
import assert from "node:assert/strict";
import type { Firestore } from "@google-cloud/firestore";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { services } from "../lib/firebase-server";
import { POST } from "../app/api/visits/route";
import { recordPlatformVisit } from "../lib/platform-visits";
import { reportPlatformVisits } from "../lib/platform-visit-client";

test("entry reporter handles restored sessions, foreground returns, hidden tabs and duplicate events", async () => {
  const browser = new EventTarget(), page = Object.assign(new EventTarget(), { visibilityState: "visible" });
  let clock = 0, calls = 0;
  const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
  const detach = reportPlatformVisits(async () => { calls++; return true; }, page as unknown as Document, browser as unknown as Window, () => clock);
  await flush(); assert.equal(calls, 1, "entering an existing authenticated session records a visit");
  browser.dispatchEvent(new Event("focus")); page.dispatchEvent(new Event("visibilitychange"));
  await flush(); assert.equal(calls, 1);
  clock = 60_000; page.visibilityState = "hidden"; page.dispatchEvent(new Event("visibilitychange")); browser.dispatchEvent(new Event("focus"));
  await flush(); assert.equal(calls, 1);
  page.visibilityState = "visible"; page.dispatchEvent(new Event("visibilitychange"));
  await flush(); assert.equal(calls, 2, "returning to the platform does not require a new login");
  clock = 120_000; browser.dispatchEvent(new Event("pageshow")); await flush(); assert.equal(calls, 3);
  detach(); clock = 180_000; browser.dispatchEvent(new Event("focus")); await flush(); assert.equal(calls, 3);
});

test("visits merge server timestamps into metrics and never replace question counts", async () => {
  let data: Record<string, unknown> = { questions: 7 }, writes = 0;
  const ref = {};
  const db = {
    collection: (name: string) => { assert.equal(name, "users"); return { doc: (uid: string) => { assert.equal(uid, "student"); return { collection: () => ({ doc: () => ref }) }; } }; },
    runTransaction: async (change: (transaction: unknown) => Promise<unknown>) => change({ get: async () => ({ get: (field: string) => data[field] }), set: (target: object, patch: object, options: object) => { assert.equal(target, ref); assert.deepEqual(options, { merge: true }); writes++; data = { ...data, ...patch }; } }),
  } as unknown as Firestore;
  const start = new Date("2026-11-12T14:15:00.000Z");
  assert.equal(await recordPlatformVisit(db, "student", start), start.toISOString());
  assert.equal(await recordPlatformVisit(db, "student", new Date(start.getTime() + 3000)), start.toISOString());
  assert.equal(writes, 1); assert.equal(data.questions, 7);
  const later = new Date(start.getTime() + 60_000);
  assert.equal(await recordPlatformVisit(db, "student", later), later.toISOString());
  assert.equal(data.questions, 7); assert.equal(writes, 2);
});

test("visit endpoint trusts only the verified UID and the server clock", async () => {
  const previous = process.env.NEXT_PUBLIC_FIREBASE_ENABLED;
  process.env.NEXT_PUBLIC_FIREBASE_ENABLED = "true";
  const app = initializeApp({ projectId: "visits-test", storageBucket: "visits-test.appspot.com" }, "margine-server");
  const { auth, db } = services(), original = { verify: auth.verifyIdToken, collection: db.collection, transaction: db.runTransaction };
  let recordedUid = "", stored: Record<string, unknown> = {};
  auth.verifyIdToken = (async (_token: string, revoked: boolean) => { assert.equal(revoked, true); return { uid: "actual-student" }; }) as unknown as typeof auth.verifyIdToken;
  db.collection = (() => ({ doc: (uid: string) => { recordedUid = uid; return { collection: () => ({ doc: () => ({}) }) }; } })) as unknown as typeof db.collection;
  db.runTransaction = (async (change: (transaction: unknown) => Promise<unknown>) => change({ get: async () => ({ get: () => undefined }), set: (_ref: unknown, data: Record<string, unknown>) => { stored = data; } })) as unknown as typeof db.runTransaction;
  try {
    assert.equal((await POST(new Request("http://127.0.0.1/api/visits", { method: "POST" }))).status, 401);
    const before = Date.now();
    const response = await POST(new Request("http://127.0.0.1/api/visits", { method: "POST", headers: { authorization: "Bearer test" }, body: JSON.stringify({ uid: "forged-admin", lastVisitAt: "2100-01-01T00:00:00Z" }) }));
    assert.equal(response.status, 200); assert.equal(recordedUid, "actual-student");
    assert.ok(Date.parse(String(stored.lastVisitAt)) >= before && Date.parse(String(stored.lastVisitAt)) <= Date.now());
    process.env.NEXT_PUBLIC_FIREBASE_ENABLED = "false";
    assert.deepEqual(await (await POST(new Request("http://127.0.0.1/api/visits", { method: "POST" }))).json(), { tracked: false });
  } finally { auth.verifyIdToken = original.verify; db.collection = original.collection; db.runTransaction = original.transaction; await deleteApp(app); if (previous === undefined) delete process.env.NEXT_PUBLIC_FIREBASE_ENABLED; else process.env.NEXT_PUBLIC_FIREBASE_ENABLED = previous; }
});
