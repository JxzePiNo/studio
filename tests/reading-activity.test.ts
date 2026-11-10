import assert from "node:assert/strict";
import test from "node:test";
import { freshSession, recordStudyPage, restoreSession } from "../lib/study-session";
import { readingCalendar, readingLevel } from "../lib/reading-activity";

test("activity migrates yesterday and keeps previous days when today's reads change", () => {
  const yesterday = new Date(2026, 10, 10, 12).getTime();
  const today = new Date(2026, 10, 11, 12).getTime();
  const legacy = JSON.stringify({ day: "2026-11-10", pages: ["doc:1", "doc:2", "doc:2"], elapsedMs: 500, startedAt: null });
  let session = restoreSession(legacy, today);
  assert.deepEqual(session.activity, { "2026-11-10": 2 });
  assert.equal(session.pages.length, 0);
  session = recordStudyPage(session, "doc", 3, true, today);
  session = recordStudyPage(session, "doc", 3, true, today);
  assert.deepEqual(session.activity, { "2026-11-10": 2, "2026-11-11": 1 });
  session = recordStudyPage(session, "doc", 3, false, today);
  assert.deepEqual(session.activity, { "2026-11-10": 2, "2026-11-11": 0 });
  const restored = restoreSession(JSON.stringify(recordStudyPage(freshSession(yesterday), "doc", 1, true, yesterday)), today);
  assert.equal(restored.activity["2026-11-10"], 1);
  assert.equal(restored.elapsedMs, 0);
});

test("calendar covers 365 local dates with leap day and Monday-to-Sunday alignment", () => {
  const weeks = readingCalendar({ "2024-02-29": 12, "2024-03-01": 2 }, "2024-03-01");
  const days = weeks.flat().filter(day => day !== null);
  assert.equal(days.length, 365);
  assert.equal(new Set(days.map(day => day.date)).size, 365);
  assert.equal(days.at(-1)?.date, "2024-03-01");
  assert.equal(days.find(day => day.date === "2024-02-29")?.count, 12);
  for (const week of weeks) {
    assert.equal(week.length, 7);
    week.forEach((day, index) => { if (day) assert.equal((new Date(`${day.date}T12:00:00`).getDay() + 6) % 7, index); });
  }
  assert.deepEqual([0, 1, 4, 5, 9, 10, 19, 20].map(readingLevel), [0, 1, 1, 2, 2, 3, 3, 4]);
  assert.deepEqual(readingCalendar({}, "invalid"), []);
});

test("invalid historical values cannot create fake study totals", () => {
  const session = restoreSession(JSON.stringify({ day: "bad", pages: [], activity: { "2026-02-30": 9, "2026-11-10": -2, "2026-11-09": "8", "2026-11-08": 3 } }), new Date(2026, 10, 11).getTime());
  assert.deepEqual(session.activity, { "2026-11-08": 3 });
});
