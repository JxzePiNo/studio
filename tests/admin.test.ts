import test from "node:test";
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import { services } from "../lib/firebase-server";
import { adminGuard, verifyAdminToken } from "../lib/admin-server";
import { defaultPlatform, isAdminIdentity, platformSchema } from "../lib/platform-config";
import { platformDenial } from "../lib/platform-server";
import { PATCH } from "../app/api/admin/users/[uid]/route";
import { GET as adminGET } from "../app/api/admin/route";
import { GET as costsGET } from "../app/api/admin/costs/route";
import { GET as pdfGET } from "../app/api/admin/users/[uid]/documents/[id]/pdf/route";

test("admin overview sums file fields independently without a composite index", async () => {
  const previous = process.env.NEXT_PUBLIC_FIREBASE_ENABLED;
  process.env.NEXT_PUBLIC_FIREBASE_ENABLED = "true";
  const app = initializeApp({ projectId: "admin-test", storageBucket: "admin-test.appspot.com" }, "margine-server");
  const { auth, db } = services();
  const original = { verify: auth.verifyIdToken, list: auth.listUsers, collection: db.collection };
  auth.verifyIdToken = (async () => ({ uid: "root", email: "paolucciacopo@gmail.com", email_verified: true })) as unknown as typeof auth.verifyIdToken;
  auth.listUsers = (async () => ({ users: [{ uid: "student", metadata: {}, disabled: false, emailVerified: true }] })) as unknown as typeof auth.listUsers;
  let aggregations = 0;
  db.collection = ((name: string) => {
    if (name === "adminAudit") return { orderBy: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }) };
    if (name === "appSettings") return { doc: () => ({ get: async () => ({ exists: false }) }) };
    return { doc: () => ({ collection: (child: string) => child === "metrics" ? { doc: () => ({ get: async () => ({ data: () => undefined }) }) } : {
      count: () => ({ get: async () => ({ data: () => ({ count: 3 }) }) }),
      aggregate: (fields: Record<string, unknown>) => {
        assert.deepEqual(Object.keys(fields), ["value"]);
        const value = ++aggregations === 1 ? 1024 : 12;
        return { get: async () => ({ data: () => ({ value }) }) };
      },
    } }) };
  }) as unknown as typeof db.collection;
  try {
    const response = await adminGET(new Request("http://127.0.0.1/api/admin", { headers: { authorization: "Bearer test" } }));
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).users[0].files, { count: 3, bytes: 1024, pages: 12 });
    assert.equal(aggregations, 2);
  } finally {
    auth.verifyIdToken = original.verify; auth.listUsers = original.list; db.collection = original.collection;
    await deleteApp(app);
    if (previous === undefined) delete process.env.NEXT_PUBLIC_FIREBASE_ENABLED; else process.env.NEXT_PUBLIC_FIREBASE_ENABLED = previous;
  }
});

test("admin access requires verified allowlisted identity, revocation checks and cloud authentication", async () => {
  assert.equal(isAdminIdentity({ email: "paolucciacopo@gmail.com", email_verified: false }), false);
  assert.equal(isAdminIdentity({ email: "other@gmail.com", email_verified: true }), false);
  assert.equal(isAdminIdentity({ email: "PAOLUCCIACOPO@gmail.com", email_verified: true }), true);
  const verify = async (email: string, verified: boolean) => verifyAdminToken("token", async (token, revoked) => { assert.equal(token, "token"); assert.equal(revoked, true); return { uid: "root", email, email_verified: verified } as DecodedIdToken; });
  assert.equal((await verify("other@gmail.com", true) as Response).status, 403);
  assert.equal((await verify("paolucciacopo@gmail.com", false) as Response).status, 403);
  assert.equal((await verify("paolucciacopo@gmail.com", true) as DecodedIdToken).uid, "root");
  assert.equal((await verifyAdminToken("revoked", async () => { throw new Error("revoked"); }) as Response).status, 401);
  const previous = process.env.NEXT_PUBLIC_FIREBASE_ENABLED;
  try {
    process.env.NEXT_PUBLIC_FIREBASE_ENABLED = "false";
    assert.equal((await adminGuard(new Request("http://127.0.0.1/api/admin")) as Response).status, 403);
    assert.equal((await adminGET(new Request("http://127.0.0.1/api/admin"))).status, 403);
    assert.equal((await costsGET(new Request("http://127.0.0.1/api/admin/costs"))).status, 403);
    assert.equal((await pdfGET(new Request("http://127.0.0.1/pdf"), { params: Promise.resolve({ uid: "other", id: "id" }) })).status, 403);
    process.env.NEXT_PUBLIC_FIREBASE_ENABLED = "true";
    assert.equal((await adminGuard(new Request("http://127.0.0.1/api/admin")) as Response).status, 401);
    assert.equal((await adminGuard(new Request("http://127.0.0.1/api/admin", { headers: { origin: "https://evil.test" } })) as Response).status, 403);
  } finally { if (previous === undefined) delete process.env.NEXT_PUBLIC_FIREBASE_ENABLED; else process.env.NEXT_PUBLIC_FIREBASE_ENABLED = previous; }
});

test("platform flags and per-user overrides block API calls; admin cannot disable itself; actions are audited", async () => {
  const previous = process.env.NEXT_PUBLIC_FIREBASE_ENABLED; process.env.NEXT_PUBLIC_FIREBASE_ENABLED = "true";
  const app = initializeApp({ projectId: "admin-test", storageBucket: "admin-test.appspot.com" }, "margine-server"), auth = getAuth(app), db = services().db;
  const original = { verify: auth.verifyIdToken, get: auth.getUser, update: auth.updateUser, revoke: auth.revokeRefreshTokens, collection: db.collection };
  let config = structuredClone(defaultPlatform), controls: Record<string, unknown> = {}, writes = 0, revocations = 0;
  const actor = { uid: "root", email: "paolucciacopo@gmail.com", email_verified: true };
  auth.verifyIdToken = (async () => actor) as unknown as typeof auth.verifyIdToken;
  auth.getUser = (async (uid: string) => ({ uid, email: uid === "root" ? actor.email : "user@test.it", emailVerified: true })) as unknown as typeof auth.getUser;
  auth.updateUser = (async () => { writes++; return {}; }) as unknown as typeof auth.updateUser;
  auth.revokeRefreshTokens = async () => { revocations++; };
  const audit: Record<string, unknown>[] = [];
  db.collection = ((collection: string) => ({
    add: async (value: Record<string, unknown>) => { audit.push(value); },
    doc: () => collection === "appSettings" ? { get: async () => ({ exists: true, get: () => config }) } : { collection: () => ({ doc: () => ({ get: async () => ({ data: () => controls }), set: async (value: Record<string, unknown>) => { controls = value; } }) }) },
  })) as unknown as typeof db.collection;
  try {
    const caller = { uid: "user", email: "user@test.it", email_verified: true };
    const req = (path: string, body: unknown = {}) => new Request(`http://127.0.0.1/api/${path}`, { method: "POST", body: JSON.stringify(body) });
    assert.equal(await platformDenial(req("documents/id/chat"), caller), undefined);
    config.features.chat = false;
    assert.equal((await platformDenial(req("documents/id/chat"), caller))?.status, 403);
    config.features.chat = true; controls = { features: { images: false } };
    assert.equal((await platformDenial(req("documents/id/visualizations", { kind: "image" }), caller))?.status, 403);
    assert.equal(await platformDenial(req("documents/id/visualizations", { kind: "map" }), caller), undefined);
    controls = { aiBlocked: true };
    assert.equal((await platformDenial(req("documents/id/quiz"), caller))?.status, 403);
    assert.equal(await platformDenial(req("documents"), caller), undefined);
    config.maintenance = true;
    assert.equal((await platformDenial(req("documents"), caller))?.status, 503);
    assert.equal(await platformDenial(req("admin"), caller), undefined);
    assert.equal(await platformDenial(req("documents"), actor), undefined);
    const change = (uid: string, body: unknown) => PATCH(new Request("http://127.0.0.1/api/admin/users/user", { method: "PATCH", headers: { authorization: "Bearer test" }, body: JSON.stringify(body) }), { params: Promise.resolve({ uid }) });
    assert.equal((await change("root", { action: "status", disabled: true })).status, 400);
    assert.equal(writes, 0);
    assert.equal((await change("user", { action: "status", disabled: true })).status, 200);
    assert.equal(writes, 1); assert.equal(revocations, 1); assert.equal(audit.length, 2);
    assert.equal(audit[0].action, "status.requested"); assert.equal(audit[1].action, "status.completed");
    assert.equal((await change("../root", { action: "revoke" })).status, 400);
    assert.equal((await change("user", { action: "status", disabled: "false" })).status, 400);
    assert.equal(platformSchema.safeParse({ ...config, arbitraryCode: "evil" }).success, false);
  } finally { auth.verifyIdToken = original.verify; auth.getUser = original.get; auth.updateUser = original.update; auth.revokeRefreshTokens = original.revoke; db.collection = original.collection; await deleteApp(app); if (previous === undefined) delete process.env.NEXT_PUBLIC_FIREBASE_ENABLED; else process.env.NEXT_PUBLIC_FIREBASE_ENABLED = previous; }
});
