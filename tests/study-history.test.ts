import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { savedSessionInputSchema, studyDateSchema, studyHistoryInputSchema } from "../lib/study-history";
import { getStudyHistory, importReadingActivity, mutateStudySessions, recordReadingBatch, saveStudySession } from "../lib/study-history-store";

test("reading history deduplicates range retries, handles concurrent writes and preserves separate days", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "studio-history-"));
  const previous = process.env.DATA_DIR;
  process.env.DATA_DIR = root; process.env.NEXT_PUBLIC_FIREBASE_ENABLED = "false";
  const documentId = randomUUID();
  try {
    const events = Array.from({ length: 25 }, (_, index) => ({ documentId, page: index + 1, day: "2026-11-10", read: true }));
    await Promise.all(events.map(event => recordReadingBatch([event])));
    await recordReadingBatch(events);
    await recordReadingBatch([{ documentId, page: 1, day: "2026-11-09", read: true }]);
    let history = await getStudyHistory("2026-11-10");
    assert.equal(history.activity["2026-11-10"], 25);
    assert.equal(history.activity["2026-11-09"], 1);
    assert.equal(history.todayPages.length, 25);
    await recordReadingBatch([{ ...events[0], read: false }]);
    history = await getStudyHistory("2026-11-10");
    assert.equal(history.activity["2026-11-10"], 24);
    assert.equal(history.activity["2026-11-09"], 1);
  } finally { if (previous === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = previous; await rm(root, { recursive: true, force: true }); }
});

test("session IDs are idempotent and statistics derive from distinct PDF pages", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "studio-history-"));
  const previous = process.env.DATA_DIR;
  process.env.DATA_DIR = root; process.env.NEXT_PUBLIC_FIREBASE_ENABLED = "false";
  const documentId = randomUUID();
  try {
    const session = { id: randomUUID(), startedAt: "2026-11-10T10:00:00.000Z", endedAt: "2026-11-10T10:05:00.000Z", day: "2026-11-10", durationMs: 300000, pages: [{ documentId, page: 1, name: "Reti.pdf" }, { documentId, page: 1, name: "Reti.pdf" }, { documentId, page: 2, name: "Reti.pdf" }] };
    await Promise.all([saveStudySession(session), saveStudySession(session)]);
    await importReadingActivity({ "2026-11-09": 8 });
    await importReadingActivity({ "2026-11-09": 80 });
    const history = await getStudyHistory("2026-11-10");
    assert.equal(history.sessions.length, 1);
    assert.equal(history.sessions[0].pagesRead, 2);
    assert.deepEqual(history.sessions[0].documents, [{ id: documentId, name: "Reti.pdf", pagesRead: 2 }]);
    assert.equal(history.activity["2026-11-09"], 8);
    await writeFile(path.join(root, "study-sessions.json"), "invalid JSON");
    await assert.rejects(() => getStudyHistory("2026-11-10"));
  } finally { if (previous === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = previous; await rm(root, { recursive: true, force: true }); }
});

test("history validates dates, duration, document selectors and unknown fields", () => {
  assert.equal(studyDateSchema.safeParse("2026-02-31").success, false);
  assert.equal(studyDateSchema.safeParse("2026-99-99").success, false);
  assert.equal(studyDateSchema.safeParse("2024-02-29").success, true);
  assert.equal(studyHistoryInputSchema.safeParse({ type: "read", day: "2026-11-10", documentId: "../../other-user", page: 1, read: true }).success, false);
  assert.equal(studyHistoryInputSchema.safeParse({ type: "read", day: "2026-11-10", documentId: randomUUID(), page: 1, read: true, uid: "another" }).success, false);
  assert.equal(savedSessionInputSchema.safeParse({ id: randomUUID(), startedAt: "2026-11-10T10:00:00Z", endedAt: "2026-11-10T10:00:01Z", day: "2026-11-10", durationMs: 100000, pages: [] }).success, false);
});

test("bulk session merge unions overlap and pages atomically, preserves activity, and deletion is idempotent", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "studio-history-bulk-"));
  const previous = process.env.DATA_DIR;
  process.env.DATA_DIR = root; process.env.NEXT_PUBLIC_FIREBASE_ENABLED = "false";
  const documentId = randomUUID();
  try {
    const first = { id: randomUUID(), startedAt: "2026-11-10T10:00:00.000Z", endedAt: "2026-11-10T10:10:00.000Z", day: "2026-11-10", durationMs: 600000, pages: [{ documentId, page: 1 }] };
    const second = { ...first, id: randomUUID(), startedAt: "2026-11-10T10:05:00.000Z", endedAt: "2026-11-10T10:15:00.000Z", pages: [...first.pages, { documentId, page: 2 }] };
    await saveStudySession(first); await saveStudySession(second);
    await recordReadingBatch([{ documentId, page: 1, day: first.day, read: true }]);
    await assert.rejects(() => mutateStudySessions([first.id, randomUUID()], "merge"));
    assert.equal((await getStudyHistory(first.day)).sessions.length, 2);
    await assert.rejects(() => mutateStudySessions(["../../other-user"], "delete"));
    await mutateStudySessions([first.id, first.id, second.id], "merge");
    const history = await getStudyHistory(first.day);
    assert.equal(history.sessions.length, 1);
    const merged = history.sessions[0];
    assert.ok(!new Set<string>([first.id, second.id]).has(merged.id));
    assert.equal(merged.durationMs, 900000);
    assert.equal(merged.pagesRead, 2);
    assert.equal(merged.mergedCount, 2);
    assert.equal(history.activity[first.day], 1);
    await assert.rejects(() => mutateStudySessions([first.id, second.id], "merge"));
    await mutateStudySessions([merged.id], "delete"); await mutateStudySessions([merged.id], "delete");
    const deleted = await getStudyHistory(first.day);
    assert.equal(deleted.sessions.length, 0);
    assert.equal(deleted.activity[first.day], 1);
    assert.deepEqual(deleted.todayPages, [`${documentId}:1`]);
  } finally { if (previous === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = previous; await rm(root, { recursive: true, force: true }); }
});
