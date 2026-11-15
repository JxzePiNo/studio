import test from "node:test";
import assert from "node:assert/strict";
import { compareAdminUsers, isAdminUserOnline, type AdminUserOrder } from "../lib/admin-user-order";

test("admin users sort by platform visit with missing visits last and stable ties", () => {
  const users = [
    { uid: "unknown", name: "Zoe", createdAt: "2026-11-15", lastVisitAt: null },
    { uid: "old", name: "Alice", createdAt: "2026-10-01", lastVisitAt: "2026-11-12" },
    { uid: "new", name: "Bob", createdAt: "2026-11-01", lastVisitAt: "2026-11-15" },
  ];
  const sorted = (order: AdminUserOrder) => [...users].sort((a, b) => compareAdminUsers(a, b, order)).map(user => user.uid);
  assert.deepEqual(sorted("lastVisit"), ["new", "old", "unknown"]);
  assert.deepEqual(sorted("oldestVisit"), ["old", "new", "unknown"]);
  assert.deepEqual(sorted("name"), ["old", "new", "unknown"]);
  assert.deepEqual(sorted("created"), ["unknown", "new", "old"]);
  assert.ok(compareAdminUsers({ ...users[0], uid: "a" }, { ...users[0], uid: "b" }, "lastVisit") < 0);
});

test("admin online indicator expires after visible visit heartbeats stop", () => {
  const now = Date.parse("2026-11-15T12:00:00Z");
  assert.equal(isAdminUserOnline(new Date(now - 60000).toISOString(), now), true);
  assert.equal(isAdminUserOnline(new Date(now - 90000).toISOString(), now), false);
  assert.equal(isAdminUserOnline(null, now), false);
  assert.equal(isAdminUserOnline("invalid", now), false);
  assert.equal(isAdminUserOnline(new Date(now + 60000).toISOString(), now), false);
});
