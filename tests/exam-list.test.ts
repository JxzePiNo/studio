import assert from "node:assert/strict";
import test from "node:test";
import { visibleExams } from "../lib/exam-list";
import type { ExamFolder } from "../lib/types";

function folder(id: string, name: string, examDate?: string, createdAt = "2026-11-01T12:00:00Z"): ExamFolder {
  return { id, name, examDate, createdAt };
}

test("exam search ignores case, accents, and surrounding spaces without changing names", () => {
  const folders = [folder("a", "ANALISI MATEMATICA"), folder("b", "Società e cultura")];
  assert.deepEqual(visibleExams(folders, " SOCIETA ", "name").map(item => item.id), ["b"]);
  assert.equal(folders[1].name, "Società e cultura");
  assert.equal(visibleExams(folders, "chimica", "name").length, 0);
});

test("deadline order prioritizes upcoming exams, then recent passed dates, then missing dates", () => {
  const folders = [folder("none", "No date"), folder("old", "Old", "2026-10-01"), folder("later", "Later", "2026-12-01"), folder("today", "Today", "2026-11-10"), folder("past", "Past", "2026-11-09"), folder("invalid", "Invalid", "2026-02-30")];
  const original = folders.map(item => item.id);
  assert.deepEqual(visibleExams(folders, "", "deadline", "2026-11-10").map(item => item.id), ["today", "later", "past", "old", "none", "invalid"]);
  assert.deepEqual(folders.map(item => item.id), original);
});

test("exam sorting is stable for equal dates and supports names and creation timestamps", () => {
  const folders = [folder("z", "Zoologia", "2026-12-01"), folder("a", "Analisi", "2026-12-01", "2026-11-02T12:00:00Z"), folder("b", "Biologia", "2026-12-01")];
  assert.deepEqual(visibleExams(folders, "", "deadline", "2026-11-10").map(item => item.id), ["z", "a", "b"]);
  assert.deepEqual(visibleExams(folders, "", "name").map(item => item.id), ["a", "b", "z"]);
  assert.deepEqual(visibleExams(folders, "", "newest").map(item => item.id), ["a", "z", "b"]);
});
