import test from "node:test";
import assert from "node:assert/strict";
import { FriendsService, friendsActionSchema, periodStart, studyScore } from "../lib/friends";
import { memoryFirestore } from "./helpers/memory-firestore";

const now = Date.parse("2026-11-12T12:00:00Z");
const identity = (name: string, university = "Università di Bologna") => ({ name, university, nickname: name.toLowerCase(), studyProgram: "Informatica" });

test("shared profile respects privacy and blocks and reports relationship without exposing study data", async () => {
  const db = memoryFirestore(), alice = new FriendsService(db, "alice", now), bob = new FriendsService(db, "bob", now);
  await alice.ensureProfile(identity("Alice")); await bob.ensureProfile(identity("Bob"));
  assert.equal((await alice.sharedProfile("bob")).person?.relationship, "none");
  assert.equal((await alice.sharedProfile("missing")).person, null);
  assert.equal((await alice.sharedProfile("alice")).self, true);
  await assert.rejects(alice.sharedProfile("bad/id"), { status: 400 });
  await alice.relationship("bob", "request");
  assert.equal((await alice.sharedProfile("bob")).person?.relationship, "outgoing");
  assert.equal((await bob.sharedProfile("alice")).person?.relationship, "incoming");
  await bob.relationship("alice", "accept");
  const shared = (await alice.sharedProfile("bob")).person!;
  assert.equal(shared.relationship, "friend"); assert.equal(shared.status, undefined);
  assert.equal("durationMs" in shared, false);
  await bob.saveSettings({ action: "settings", discoverable: false, shareActivity: true }, identity("Bob"));
  assert.equal((await alice.sharedProfile("bob")).person, null);
  await bob.saveSettings({ action: "settings", discoverable: true, shareActivity: true }, identity("Bob"));
  await alice.block("bob", true);
  assert.equal((await alice.sharedProfile("bob")).person, null);
  assert.equal((await bob.sharedProfile("alice")).person, null);
});

test("blocking removes relationships and hides both users until all blocks are removed", async () => {
  const db = memoryFirestore(), alice = new FriendsService(db, "alice", now), bob = new FriendsService(db, "bob", now);
  await alice.ensureProfile(identity("Alice")); await bob.ensureProfile(identity("Bob"));
  await alice.relationship("bob", "request"); await bob.relationship("alice", "accept");
  await bob.presence("tab", true, true);
  await alice.block("bob", true);
  assert.equal((await alice.overview("day")).friends.length, 0);
  assert.equal((await bob.overview("day")).friends.length, 0);
  assert.equal((await alice.overview("day")).blocked?.[0].id, "bob");
  assert.equal((await bob.overview("day")).blocked?.length, 0);
  assert.equal((await alice.activity()).online.length, 0);
  assert.equal((await alice.search("bob")).people.length, 0);
  assert.equal((await bob.search("alice")).people.length, 0);
  await assert.rejects(bob.relationship("alice", "request"), { status: 404 });
  await bob.block("alice", true); await alice.block("bob", false);
  await assert.rejects(alice.relationship("bob", "request"), { status: 404 });
  await bob.block("alice", false);
  assert.equal((await alice.search("bob")).people.length, 1);
  assert.equal((await alice.overview("day")).friends.length, 0, "unblocking never restores friendship automatically");
  await assert.rejects(alice.block("alice", true), { status: 400 });
});

test("reports are private, authenticated records and do not change the friendship", async () => {
  const db = memoryFirestore(), alice = new FriendsService(db, "alice", now), bob = new FriendsService(db, "bob", now);
  await alice.ensureProfile(identity("Alice")); await bob.ensureProfile(identity("Bob"));
  await alice.relationship("bob", "request"); await bob.relationship("alice", "accept");
  await alice.report("bob", "spam", "Messaggi indesiderati");
  const records = await db.collection("socialReports").get();
  assert.equal(records.size, 1);
  assert.equal(records.docs[0].get("reporterId"), "alice");
  assert.equal(records.docs[0].get("targetId"), "bob");
  assert.equal(records.docs[0].get("status"), "pending");
  assert.equal((await alice.overview("day")).friends.length, 1);
  assert.equal(friendsActionSchema.safeParse({ action: "report", targetId: "bob", reason: "spam", details: "", reporterId: "carol" }).success, false);
  assert.equal(friendsActionSchema.safeParse({ action: "report", targetId: "bob", reason: "spam", details: "x".repeat(1001) }).success, false);
});

test("incoming requests show the latest first regardless of alphabetical name order", async () => {
  const db = memoryFirestore();
  for (const name of ["Alice", "Bob", "Zoe"]) await new FriendsService(db, name.toLowerCase(), now).ensureProfile(identity(name));
  await new FriendsService(db, "bob", now).relationship("alice", "request");
  await new FriendsService(db, "zoe", now + 1000).relationship("alice", "request");
  const overview = await new FriendsService(db, "alice", now + 2000).overview("day");
  assert.deepEqual(overview.incoming.map(person => person.id), ["zoe", "bob"]);
});
test("friendship requires recipient consent, rejects forged transitions and hides activity until accepted", async () => {
  const db = memoryFirestore(), alice = new FriendsService(db, "alice", now), bob = new FriendsService(db, "bob", now), outsider = new FriendsService(db, "carol", now);
  for (const [service, name] of [[alice, "Alice"], [bob, "Bob"], [outsider, "Carol"]] as const) await service.saveSettings({ action: "settings", enabled: true, discoverable: true, shareActivity: true }, identity(name));
  await assert.rejects(alice.relationship("alice", "request"), { status: 400 });
  await alice.relationship("bob", "request");
  await bob.presence("tab", true, true);
  assert.equal((await alice.overview("day")).outgoing[0].status, undefined);
  assert.equal((await alice.activity()).studying.length, 0);
  await assert.rejects(alice.relationship("bob", "accept"), { status: 403 });
  await assert.rejects(outsider.relationship("bob", "accept"), { status: 404 });
  await bob.relationship("alice", "accept");
  assert.equal((await alice.activity()).studying[0].id, "bob");
  assert.equal((await alice.overview("day")).friends[0].status, "studying");
  await bob.relationship("alice", "remove");
  assert.equal((await alice.activity()).studying.length, 0);
});
test("university suggestions and nickname search disclose no private data and respect opt-outs", async () => {
  const db = memoryFirestore(), alice = new FriendsService(db, "alice", now), bob = new FriendsService(db, "bob", now), carol = new FriendsService(db, "carol", now);
  await alice.saveSettings({ action: "settings", enabled: true, discoverable: true, shareActivity: true }, identity("Alice"));
  await bob.saveSettings({ action: "settings", enabled: true, discoverable: true, shareActivity: false }, identity("Bob", "  Universita di Bologna "));
  await carol.saveSettings({ action: "settings", enabled: true, discoverable: true, shareActivity: true }, identity("Carol", "Altro ateneo"));
  assert.deepEqual((await alice.search("")).people.map(person => person.id), ["bob"]);
  assert.deepEqual((await alice.search("@car")).people.map(person => person.id), ["carol"]);
  const person = (await alice.search("Bob")).people[0]; assert.equal(person.status, undefined); assert.equal("lastSeen" in person, false); assert.equal("lastRequestAt" in person, false);
  await bob.saveSettings({ action: "settings", enabled: true, discoverable: false, shareActivity: false }, identity("Bob"));
  assert.equal((await alice.search("Bob")).people.length, 0);
  await assert.rejects(alice.relationship("bob", "request"), { status: 404 });
});
test("presence expires, accounts for other visible tabs and conceals statistics on opt-out", async () => {
  const db = memoryFirestore(), alice = new FriendsService(db, "alice", now), bob = new FriendsService(db, "bob", now);
  for (const [service, name] of [[alice, "Alice"], [bob, "Bob"]] as const) await service.saveSettings({ action: "settings", enabled: true, discoverable: true, shareActivity: true }, identity(name));
  await alice.relationship("bob", "request"); await bob.relationship("alice", "accept");
  await bob.presence("one", true, true); await bob.presence("two", true, false); await bob.presence("one", false, false);
  assert.equal((await alice.overview("day")).friends[0].status, "online");
  assert.equal((await alice.activity()).online[0].id, "bob");
  assert.equal((await alice.activity()).studying.length, 0);
  assert.equal((await new FriendsService(db, "alice", now + 91000).activity()).online.length, 0);
  assert.equal((await new FriendsService(db, "alice", now + 91000).overview("day")).friends[0].status, "offline");
  await bob.saveSettings({ action: "settings", enabled: true, discoverable: true, shareActivity: false }, identity("Bob"));
  const view = await alice.overview("day"); assert.equal(view.friends[0].status, undefined); assert.deepEqual(view.leaderboard.map(person => person.id), ["alice"]);
  assert.equal(friendsActionSchema.safeParse({ action: "presence", tabId: crypto.randomUUID(), active: true, studying: true, userId: "bob" }).success, false);
});
test("daily/monthly rankings clip overlapping sessions and use Italian midnight", () => {
  const time = new Date("2026-07-12T22:30:00Z");
  assert.equal(periodStart("day", time), "2026-07-13"); assert.equal(periodStart("month", time), "2026-07-01");
  const sessions = [{ startedAt: "2026-07-12T21:30:00Z", endedAt: "2026-07-12T22:20:00Z", durationMs: 3000000 }, { startedAt: "2026-07-12T22:10:00Z", endedAt: "2026-07-12T22:30:00Z", durationMs: 1200000 }];
  assert.deepEqual(studyScore(sessions, [{ day: "2026-07-13", pages: [1, 2] }, { day: "2026-07-12", pages: [1] }], "day", time), { durationMs: 1800000, pages: 2 });
});

test("a running session studies immediately, and continuous online presence studies after five minutes", async () => {
  const db = memoryFirestore();
  const alice = new FriendsService(db, "alice", now);
  const bob = new FriendsService(db, "bob", now);
  await alice.ensureProfile(identity("Alice")); await bob.ensureProfile(identity("Bob"));
  await alice.relationship("bob", "request"); await bob.relationship("alice", "accept");
  await bob.presence("tab", true, true);
  assert.equal((await alice.activity()).studying[0].id, "bob");
  await bob.presence("tab", true, false);
  assert.equal((await alice.overview("day")).friends[0].status, "online");
  for (let elapsed = 30000; elapsed <= 300000; elapsed += 30000) {
    await new FriendsService(db, "bob", now + elapsed).presence("tab", true, false);
    const status = (await new FriendsService(db, "alice", now + elapsed).overview("day")).friends[0].status;
    assert.equal(status, elapsed < 300000 ? "online" : "studying");
  }
  assert.equal((await new FriendsService(db, "alice", now + 300000).activity()).studying[0].id, "bob");
  assert.equal((await new FriendsService(db, "alice", now + 391000).activity()).online.length, 0);
  await new FriendsService(db, "bob", now + 400000).presence("tab", true, false);
  assert.equal((await new FriendsService(db, "alice", now + 400000).overview("day")).friends[0].status, "online");
});
