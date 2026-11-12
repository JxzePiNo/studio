import test from "node:test";
import assert from "node:assert/strict";
import type { Firestore } from "@google-cloud/firestore";
import { ReferralService, referralActionSchema } from "../lib/referrals";
import { captureReferral, referralStorageKey } from "../lib/referral-client";

function database() {
  type Value = Record<string, any>;
  let records = new Map<string, Value>();
  let queue = Promise.resolve();
  const snapshot = (path: string, source = records) => ({ id: path.split("/").at(-1)!, exists: source.has(path), data: () => structuredClone(source.get(path)), get: (key: string) => key.split(".").reduce((value, part) => value?.[part], source.get(path) as any) });
  const query = (collection: string, field?: string, value?: unknown) => ({ collection, field, value, get: async () => querySnapshot(collection, field, value) });
  function querySnapshot(collection: string, field?: string, value?: unknown, source = records) {
    const docs = [...source.keys()].filter(path => path.startsWith(`${collection}/`) && (!field || source.get(path)?.[field] === value)).map(path => snapshot(path, source));
    return { docs, size: docs.length };
  }
  const db = {
    collection: (name: string) => ({ where: (field: string, _op: string, value: unknown) => query(name, field, value), doc: (id: string) => ({ path: `${name}/${id}`, get: async () => snapshot(`${name}/${id}`) }) }),
    runTransaction: (run: (tx: any) => Promise<unknown>) => {
      const task = queue.catch(() => {}).then(async () => {
        const next = structuredClone(records);
        const tx = {
          get: async (ref: any) => ref.path ? snapshot(ref.path, next) : querySnapshot(ref.collection, ref.field, ref.value, next),
          create: (ref: any, value: Value) => { assert.ok(!next.has(ref.path)); next.set(ref.path, structuredClone(value)); },
          update: (ref: any, value: Value) => {
            const data = next.get(ref.path)!;
            for (const [key, entry] of Object.entries(value)) {
              const parts = key.split("."); let target = data;
              for (const part of parts.slice(0, -1)) target = target[part];
              target[parts.at(-1)!] = structuredClone(entry);
            }
          },
        };
        const result = await run(tx); records = next; return result;
      });
      queue = task.then(() => {}, () => {});
      return task;
    },
  } as unknown as Firestore;
  return db;
}

test("referrals are attributed once, exclude self-referrals and reveal only the owner's invitees", async () => {
  const db = database();
  const alice = new ReferralService(db, "alice");
  const bob = new ReferralService(db, "bob");
  const carol = new ReferralService(db, "carol");
  const { code } = await alice.createLink("Compagni");
  const other = await carol.createLink("Amici");
  await assert.rejects(alice.claim(code, "Alice"), { status: 400 });
  await assert.rejects(bob.claim("f".repeat(24), "Bob"), { status: 404 });
  assert.deepEqual(await bob.claim(code, "Bob"), { claimed: true });
  assert.deepEqual(await bob.claim(other.code, "Bob"), { claimed: false });
  const overview = await alice.overview();
  assert.equal(overview.links[0].count, 1);
  assert.equal(overview.invitees[0].name, "Bob");
  assert.equal(overview.invitees[0].linkLabel, "Compagni");
  assert.equal((await carol.overview()).invitees.length, 0);
  assert.equal((await bob.overview()).invitees.length, 0);
});

test("only the inviter can send one greeting; only the recipient can acknowledge the matching greeting", async () => {
  const db = database();
  const alice = new ReferralService(db, "alice"); const bob = new ReferralService(db, "bob"); const carol = new ReferralService(db, "carol");
  const { code } = await alice.createLink("Amici"); await bob.claim(code, "Bob");
  await assert.rejects(carol.greet("bob", "Ciao", "Carol"), { status: 404 });
  await alice.greet("bob", "Benvenuto, buon esame!", "Alice");
  await assert.rejects(alice.greet("bob", "Secondo saluto", "Alice"), { status: 409 });
  const greeting = await bob.pending(); assert.ok(greeting);
  assert.equal(greeting.fromName, "Alice");
  assert.equal((await alice.overview()).invitees[0].greeting?.readAt, undefined);
  assert.deepEqual(await bob.pending(), greeting, "fetching a greeting does not acknowledge it");
  await assert.rejects(carol.read(greeting.id), { status: 404 });
  await assert.rejects(bob.read("00000000-0000-4000-8000-000000000000"), { status: 404 });
  await bob.read(greeting.id);
  const firstRead = (await alice.overview()).invitees[0].greeting?.readAt;
  assert.ok(firstRead);
  await bob.read(greeting.id);
  assert.equal((await alice.overview()).invitees[0].greeting?.readAt, firstRead);
  assert.equal(await bob.pending(), null);
});

test("referral requests reject forged identities and oversized greetings, and enforce the link limit", async () => {
  assert.equal(referralActionSchema.safeParse({ action: "claim", code: "a".repeat(24), userId: "other" }).success, false);
  assert.equal(referralActionSchema.safeParse({ action: "greet", recipientId: "other/path", text: "Ciao" }).success, false);
  assert.equal(referralActionSchema.safeParse({ action: "greet", recipientId: "bob", text: "a".repeat(281) }).success, false);
  const alice = new ReferralService(database(), "alice");
  for (let index = 0; index < 20; index++) await alice.createLink(`Link ${index}`);
  await assert.rejects(alice.createLink("Troppi"), { status: 400 });
});

test("the first referral survives sign-in navigation, expires and rejects invalid links", () => {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) || null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
  const first = "a".repeat(24); const second = "b".repeat(24);
  assert.equal(captureReferral(new URL(`https://studio.test/?ref=${first}`), storage, 100), first);
  assert.equal(captureReferral(new URL("https://studio.test/inviti"), storage, 200), first);
  assert.equal(captureReferral(new URL(`https://studio.test/?ref=${second}`), storage, 300), first);
  assert.equal(captureReferral(new URL(`https://studio.test/?ref=${second}`), storage, 31 * 86400000), second);
  data.delete(referralStorageKey);
  assert.equal(captureReferral(new URL("https://studio.test/?ref=invalid"), storage), undefined);
});
