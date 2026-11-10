import assert from "node:assert/strict";
import test from "node:test";
import { planReadRange, readRangeInput } from "../lib/read-range";

test("read ranges cover inclusive pages and default to today", () => {
  assert.deepEqual(planReadRange({ from: 2, to: 4 }, 10, "2026-11-10"), [{ page: 2, day: "2026-11-10" }, { page: 3, day: "2026-11-10" }, { page: 4, day: "2026-11-10" }]);
  assert.equal(readRangeInput.safeParse({ from: 1.5, to: 2 }).success, false);
  assert.throws(() => planReadRange({ from: 4, to: 2 }, 10));
  assert.throws(() => planReadRange({ from: 1, to: 11 }, 10));
});

test("historical ranges distribute pages across both ends including leap days", () => {
  assert.deepEqual(planReadRange({ from: 1, to: 3, startDate: "2024-02-28", endDate: "2024-03-01" }, 3, "2026-11-10").map(item => item.day), ["2024-02-28", "2024-02-29", "2024-03-01"]);
  assert.deepEqual(planReadRange({ from: 1, to: 2, startDate: "2026-01-01", endDate: "2026-01-10" }, 2, "2026-11-10").map(item => item.day), ["2026-01-01", "2026-01-10"]);
  assert.throws(() => planReadRange({ from: 1, to: 2, startDate: "2026-02-30", endDate: "2026-03-01" }, 2));
  assert.throws(() => planReadRange({ from: 1, to: 2, startDate: "2026-11-11", endDate: "2026-11-12" }, 2, "2026-11-10"));
  assert.throws(() => planReadRange({ from: 1, to: 2, startDate: "2026-01-01" }, 2));
});
