import test from "node:test";
import assert from "node:assert/strict";
import { friendsPresenceMessage } from "../lib/friends-presence";
import type { FriendPerson } from "../lib/friends-types";

const person = (id: string, nickname = id): FriendPerson => ({ id, nickname, name: `Nome ${id}`, university: "", studyProgram: "" });
test("Tony is always present, using nicknames and Italian conjunctions", () => {
  assert.equal(friendsPresenceMessage([], []), "Ci sono io con te");
  const alice = person("alice"), bob = person("bob");
  assert.equal(friendsPresenceMessage([alice], [alice]), "Tony e alice stanno studiando.");
  assert.equal(friendsPresenceMessage([alice, bob], [alice, bob]), "Tony, alice e bob stanno studiando.");
  assert.equal(friendsPresenceMessage([alice, bob], [bob]), "Tony e bob stanno studiando.");
  assert.equal(friendsPresenceMessage([alice], []), "Tony e alice sono qui con te.");
  assert.equal(friendsPresenceMessage([person("alice", "")], [person("alice", "")]), "Tony e Nome alice stanno studiando.");
});
