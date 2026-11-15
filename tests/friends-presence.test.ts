import test from "node:test";
import assert from "node:assert/strict";
import { friendPresenceLabel, friendsPresenceMessage } from "../lib/friends-presence";
import type { FriendPerson } from "../lib/friends-types";

const person = (id: string, nickname = id): FriendPerson => ({ id, nickname, name: `Nome ${id}`, university: "", studyProgram: "" });

test("last access uses minutes, hours and days without inventing missing timestamps", () => {
  const now = Date.parse("2026-11-15T12:00:00Z");
  assert.equal(friendPresenceLabel({ status: "online" }, now), "Online");
  assert.equal(friendPresenceLabel({ status: "studying" }, now), "Sta studiando");
  for (const [elapsed, label] of [[30000, "Online poco fa"], [5 * 60000, "Online 5min fa"], [3600000, "Online 1h fa"], [3 * 86400000, "Online 3gg fa"]] as const) {
    assert.equal(friendPresenceLabel({ status: "offline", lastSeen: now - elapsed }, now), label);
  }
  assert.equal(friendPresenceLabel({ status: "offline" }, now), "Ultimo accesso non disponibile");
});
test("Tony is always present, using nicknames and Italian conjunctions", () => {
  assert.equal(friendsPresenceMessage([], []), "Ci sono io con te");
  const alice = person("alice"), bob = person("bob");
  assert.equal(friendsPresenceMessage([alice], [alice]), "Tony e alice stanno studiando.");
  assert.equal(friendsPresenceMessage([alice, bob], [alice, bob]), "Tony, alice e bob stanno studiando.");
  assert.equal(friendsPresenceMessage([alice, bob], [bob]), "Tony e bob stanno studiando.");
  assert.equal(friendsPresenceMessage([alice], []), "Tony e alice sono qui con te.");
  assert.equal(friendsPresenceMessage([person("alice", "")], [person("alice", "")]), "Tony e Nome alice stanno studiando.");
});
