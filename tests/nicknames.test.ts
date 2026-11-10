import test from "node:test";
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { GET, PATCH } from "../app/api/nicknames/route";
import { userNickname } from "../lib/user-nickname";

test("nickname edits require the verified administrator and merge a shared catalogue", async () => {
  const previous = process.env.NEXT_PUBLIC_FIREBASE_ENABLED;
  process.env.NEXT_PUBLIC_FIREBASE_ENABLED = "true";
  const app = initializeApp({ projectId: "nickname-test", storageBucket: "nickname-test.appspot.com" }, "margine-server");
  const auth = getAuth(app);
  const db = getFirestore(app);
  const verify = auth.verifyIdToken;
  const collection = db.collection;
  let email = "other@example.com";
  let verified = true;
  let entries: Record<string, string> = {};
  let writes = 0;
  auth.verifyIdToken = (async () => ({ uid: "test", email, email_verified: verified })) as unknown as typeof verify;
  db.collection = (() => ({ doc: () => ({
    get: async () => ({ data: () => ({ entries }) }),
    set: async (value: { entries: Record<string, string> }, options: { merge: boolean }) => { assert.equal(options.merge, true); entries = { ...entries, ...value.entries }; writes++; },
  }) })) as unknown as typeof collection;
  const request = (body: unknown) => new Request("http://127.0.0.1/api/nicknames", { method: "PATCH", headers: { authorization: "Bearer test", "Content-Type": "application/json" }, body: JSON.stringify(body) });
  try {
    assert.equal((await PATCH(request({ name: "Andrea", nickname: "Andre" }))).status, 403);
    email = "paolucciacopo@gmail.com"; verified = false;
    assert.equal((await PATCH(request({ name: "Andrea", nickname: "Andre" }))).status, 403);
    assert.equal(writes, 0);
    verified = true;
    assert.equal((await PATCH(request({ name: "Andrea", nickname: " " }))).status, 400);
    const response = await PATCH(request({ name: "Andrea", nickname: "Andre" }));
    assert.equal(response.status, 200);
    assert.equal(userNickname(" ANDREA Rossi ", await response.json()), "Andre");
    const catalogue = await (await GET(new Request("http://127.0.0.1/api/nicknames", { headers: { authorization: "Bearer test" } }))).json();
    assert.equal(catalogue.iacopo, "Pino");
    assert.equal(catalogue.andrea, "Andre");
    await PATCH(request({ name: "Andrea", nickname: "Drea" }));
    assert.equal(entries.andrea, "Drea");
    assert.equal(writes, 2);
  } finally {
    auth.verifyIdToken = verify; db.collection = collection;
    await deleteApp(app);
    if (previous === undefined) delete process.env.NEXT_PUBLIC_FIREBASE_ENABLED;
    else process.env.NEXT_PUBLIC_FIREBASE_ENABLED = previous;
  }
});
