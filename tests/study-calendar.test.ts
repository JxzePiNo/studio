import test from "node:test";
import assert from "node:assert/strict";
import { addStudyDays, buildStudyCalendar, estimateCoursePace, studyTasksForDay } from "../lib/study-calendar";
import type { DocumentSummary, ExamFolder } from "../lib/types";
import type { SavedStudySession } from "../lib/study-history";

const today = "2026-11-15";
const folder: ExamFolder = { id: "course", name: "Analisi", createdAt: today, examDate: "2026-11-18", pagesPerHour: 10 };
const document = (id = "doc", folderId = "course", pages = 100, readPages = 10): DocumentSummary => ({ id, folderId, name: "Lezione.pdf", pages, readPages, analyzedPages: pages, size: 100, createdAt: today, currentPage: 1 });
const session = (pages = 10, durationMs = 3600000): SavedStudySession => ({ id: "session", day: today, startedAt: `${today}T08:00:00Z`, endedAt: new Date(Date.parse(`${today}T08:00:00Z`) + durationMs).toISOString(), durationMs, pagesRead: pages, documents: [{ id: "doc", name: "Lezione", pagesRead: pages }], pages: Array.from({ length: pages }, (_, index) => ({ documentId: "doc", page: index + 1 })) });

test("calendar distributes only unread pages before the deadline", () => {
  const plans = buildStudyCalendar([folder], [document()], [], today);
  assert.equal(plans[0].remainingPages, 90);
  assert.equal(plans[0].plan.totalHours, 9);
  for (const day of [today, "2026-11-16", "2026-11-17"]) {
    const [task] = studyTasksForDay(plans, day);
    assert.equal(task.pages, 30); assert.equal(task.hours, 3);
  }
  assert.deepEqual(studyTasksForDay(plans, "2026-11-18"), []);
  assert.deepEqual(studyTasksForDay(plans, "2026-11-14"), []);
});

test("reference materials stay available but do not affect totals or learned pace", () => {
  const reference = { ...document("book", "course", 500, 100), excludedFromStudy: true };
  const referenceSession = { ...session(50), pages: session(50).pages.map(page => ({ ...page, documentId: "book" })) };
  const plans = buildStudyCalendar([folder], [document(), reference], [referenceSession], today);
  assert.equal(plans[0].totalPages, 100);
  assert.equal(plans[0].remainingPages, 90);
  assert.equal(plans[0].pace.measured, null);
  assert.equal(studyTasksForDay(plans, today)[0].pages, 30);
  const included = buildStudyCalendar([folder], [document(), { ...reference, excludedFromStudy: false }], [], today);
  assert.equal(included[0].totalPages, 600);
  assert.equal(included[0].remainingPages, 490);
});

test("days off and remainders preserve the exact remaining workload", () => {
  const plans = buildStudyCalendar([{ ...folder, examDate: "2026-11-20", nonStudyWeekdays: [0], nonStudyDates: ["2026-11-17"] }], [document("doc", "course", 20, 10)], [], today);
  const tasks = Array.from({ length: 5 }, (_, index) => studyTasksForDay(plans, addStudyDays(today, index))).flat();
  assert.equal(tasks.reduce((sum, task) => sum + task.pages, 0), 10);
  assert.deepEqual(tasks.map(task => task.pages), [4, 3, 3]);
  assert.deepEqual(studyTasksForDay(plans, today), []);
  assert.deepEqual(studyTasksForDay(plans, "2026-11-17"), []);
});

test("pace gradually follows real dedicated sessions while retaining the initial estimate", () => {
  const pace = estimateCoursePace({ ...folder, pagesPerHour: 20 }, [document()], [session()], today);
  assert.equal(pace.measured, 10);
  assert.equal(pace.effective, 50 / 3);
  assert.equal(pace.hours, 1);
  const plans = buildStudyCalendar([{ ...folder, pagesPerHour: 20 }], [document()], [session()], today);
  assert.equal(plans[0].plan.totalHours, 90 / (50 / 3));
});

test("mixed courses, unsaved time without completed pages and tiny samples do not distort a course pace", () => {
  const mixed = { ...session(), pages: [...session().pages, { documentId: "other", page: 1 }] };
  const pace = estimateCoursePace(folder, [document(), document("other", "different")], [mixed, session(0), session(1, 60000)], today);
  assert.equal(pace.effective, 10); assert.equal(pace.measured, null);
});

test("overlapping sessions and duplicate pages are counted once", () => {
  const pace = estimateCoursePace(folder, [document()], [session(), { ...session(), id: "duplicate" }], today);
  assert.equal(pace.hours, 1); assert.equal(pace.pages, 10); assert.equal(pace.measured, 10);
});

test("short automatic checkpoints learn pace once they total five minutes", () => {
  const checkpoints = Array.from({ length: 5 }, (_, index) => ({ ...session(1, 60000), id: String(index), startedAt: `${today}T08:0${index}:00Z`, endedAt: `${today}T08:0${index + 1}:00Z` }));
  assert.equal(estimateCoursePace(folder, [document()], checkpoints.slice(0, 4), today).measured, null);
  const pace = estimateCoursePace(folder, [document()], checkpoints, today);
  assert.equal(pace.pages, 1);
  assert.equal(pace.measured, 12);
});

test("only the latest 20 sessions within 30 days influence the estimate", () => {
  const old = { ...session(40), day: "2026-10-01", startedAt: "2026-10-01T08:00:00Z", endedAt: "2026-10-01T09:00:00Z" };
  assert.equal(estimateCoursePace(folder, [document()], [old], today).measured, null);
  assert.equal(estimateCoursePace(folder, [document()], Array.from({ length: 25 }, (_, index) => ({ ...session(), id: String(index) })), today).sessions, 20);
});

test("missing, elapsed and unavailable deadlines stay visible without invented tasks", () => {
  for (const value of [{ ...folder, examDate: undefined }, { ...folder, examDate: "2026-11-14" }, { ...folder, nonStudyWeekdays: [0, 1, 2, 3, 4, 5, 6] }]) {
    const plans = buildStudyCalendar([value], [document()], [], today);
    assert.equal(plans[0].remainingPages, 90);
    assert.deepEqual(studyTasksForDay(plans, today), []);
  }
});

test("completed and archived subjects add no work; other courses add their hours", () => {
  const complete = buildStudyCalendar([folder], [document("doc", "course", 10, 10)], [], today);
  assert.equal(complete[0].plan.totalHours, 0); assert.deepEqual(studyTasksForDay(complete, today), []);
  assert.deepEqual(buildStudyCalendar([{ ...folder, archived: true }], [document()], [], today), []);
  const plans = buildStudyCalendar([folder, { ...folder, id: "other" }], [document(), document("another", "other")], [], today);
  assert.equal(studyTasksForDay(plans, today).reduce((sum, task) => sum + task.hours, 0), 6);
});

test("same-day deadlines use today and calendar arithmetic handles DST and leap years", () => {
  const plans = buildStudyCalendar([{ ...folder, examDate: today }], [document()], [], today);
  assert.equal(studyTasksForDay(plans, today)[0].pages, 90);
  assert.equal(addStudyDays("2028-02-28", 1), "2028-02-29");
  assert.equal(addStudyDays("2026-03-29", 1), "2026-03-30");
});
