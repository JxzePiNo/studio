import assert from "node:assert/strict";
import test from "node:test";
import { freshSession, pauseStudyTimer, startStudyTimer, recordStudyPage, restoreSession, sessionElapsed, type StudySession } from "../lib/study-session";

test("daily reading counts distinct pages and removes unmarked pages without carrying yesterday", () => {
  const morning = new Date(2026, 10, 10, 10).getTime();
  let session = recordStudyPage(freshSession(morning), "doc", 1, true, morning);
  session = recordStudyPage(session, "doc", 1, true, morning);
  assert.equal(session.pages.length, 1);
  session = recordStudyPage(session, "other", 1, true, morning);
  session = recordStudyPage(session, "doc", 1, false, morning);
  assert.deepEqual(session.pages, ["other:1"]);
  session = recordStudyPage(session, "doc", 2, true, new Date(2026, 10, 11, 1).getTime());
  assert.deepEqual(session.pages, ["doc:2"]);
});

test("timer restores across navigation/reload, excludes paused time and tolerates invalid storage", () => {
  const start = Date.now() - 10000;
  const running = { ...freshSession(start), elapsedMs: 5000, startedAt: start };
  assert.equal(sessionElapsed(restoreSession(JSON.stringify(running), start + 10000), start + 10000), 15000);
  assert.equal(sessionElapsed({ ...running, startedAt: null }, start + 90000), 5000);
  assert.equal(restoreSession("not JSON").pages.length, 0);
  assert.equal(restoreSession('{"elapsedMs":-10,"startedAt":"bad"}').elapsedMs, 0);
});


test("running sessions retain distinct read pages across midnight and reload", () => {
  const start = new Date(2026, 10, 10, 23, 59).getTime();
  const nextDay = new Date(2026, 10, 11, 0, 1).getTime();
  let session: StudySession = { ...freshSession(start), startedAt: start, activeId: "session-id", activePages: [] as string[] };
  session = { ...session, ...recordStudyPage(session, "doc", 1, true, start) };
  session = { ...session, ...recordStudyPage(session, "doc", 1, true, nextDay) };
  session = { ...session, ...recordStudyPage(session, "other", 2, true, nextDay) };
  const restored = restoreSession(JSON.stringify(session), nextDay);
  assert.deepEqual(restored.activePages, ["doc:1", "other:2"]);
  assert.equal(restored.activeId, "session-id");
  assert.equal(restored.activity["2026-11-10"], 1);
  assert.equal(restored.activity["2026-11-11"], 2);
  assert.equal(sessionElapsed(restored, nextDay), 120000);
  assert.deepEqual(recordStudyPage(restored, "doc", 1, false, nextDay).activePages, ["other:2"]);
});

test("pause and resume preserve one session across reload and exclude the pause", () => {
  const start = Date.now() - 100000;
  let session = startStudyTimer(freshSession(start), "one-session", start);
  session = recordStudyPage(session, "doc", 1, true, start + 1000);
  session = pauseStudyTimer(session, start + 5000);
  session = restoreSession(JSON.stringify(session), start + 60000);
  assert.equal(sessionElapsed(session, start + 60000), 5000);
  assert.equal(session.activeStartedAt, start);
  session = startStudyTimer(session, "unused-id", start + 60000);
  assert.equal(session.activeId, "one-session");
  assert.deepEqual(session.activePages, ["doc:1"]);
  assert.equal(sessionElapsed(session, start + 62000), 7000);
});
