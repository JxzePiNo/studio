import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { FriendsService } from "../lib/friends";
import { friendMessageActionSchema } from "../lib/friend-messages";
import { memoryFirestore } from "./helpers/memory-firestore";

const now = Date.parse("2026-11-15T12:00:00Z");
async function setup() {
  const db = memoryFirestore(), alice = new FriendsService(db, "alice", now), bob = new FriendsService(db, "bob", now);
  for (const [service, name] of [[alice, "Alice"], [bob, "Bob"]] as const) await service.ensureProfile({ name, nickname: name.toLowerCase(), university: "Roma", studyProgram: "Informatica" });
  return { db, alice, bob };
}
test("only accepted online friends receive private messages, with authenticated sender and idempotent retries", async () => {
  const { db, alice, bob } = await setup();
  const id = randomUUID();
  await assert.rejects(alice.sendMessage(id, "bob", "Ciao!"), { status: 403 });
  await alice.relationship("bob", "request"); await bob.relationship("alice", "accept");
  await assert.rejects(alice.sendMessage(id, "bob", "Ciao!"), { status: 409 });
  await bob.presence("tab", true, false);
  await alice.sendMessage(id, "bob", "Studiamo insieme?");
  await alice.sendMessage(id, "bob", "Studiamo insieme?");
  assert.deepEqual(await alice.incomingMessages(), []);
  const messages = await bob.incomingMessages();
  assert.equal(messages.length, 1); assert.equal(messages[0].sender.nickname, "alice"); assert.equal(messages[0].text, "Studiamo insieme?");
  await alice.readMessages([id]);
  assert.equal((await bob.incomingMessages()).length, 1, "senders cannot acknowledge the recipient's inbox");
  await assert.rejects(alice.sendMessage(randomUUID(), "bob", "Troppo presto"), { status: 409 });
  await bob.readMessages([id]); assert.deepEqual(await bob.incomingMessages(), []);
  await new FriendsService(db, "alice", now + 2000).sendMessage(randomUUID(), "bob", "Altro messaggio");
  await bob.block("alice", true);
  assert.deepEqual(await bob.incomingMessages(), []);
  await assert.rejects(new FriendsService(db, "alice", now + 4000).sendMessage(randomUUID(), "bob", "Bloccato"), { status: 403 });
});
test("message validation bounds content and rejects impersonation and malformed acknowledgements", () => {
  const valid = { action: "send", id: randomUUID(), targetId: "bob", text: " Ciao " };
  const parsed = friendMessageActionSchema.parse(valid);
  assert.equal(parsed.action === "send" && parsed.text, "Ciao");
  for (const input of [{ ...valid, senderId: "alice" }, { ...valid, text: " " }, { ...valid, text: "x".repeat(2001) }, { ...valid, targetId: "bad/id" }, { action: "read", ids: ["bad"] }]) assert.equal(friendMessageActionSchema.safeParse(input).success, false);
});
