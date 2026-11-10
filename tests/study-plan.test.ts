import assert from "node:assert/strict";
import test from "node:test";
import { calculateStudyPlan, validExamDate } from "../lib/study-plan";

test("uses all uploaded pages and the user-defined reading pace", () => {
  const plan = calculateStudyPlan(200, "2026-11-19", 10, "2026-11-09");
  assert.equal(plan.state, "upcoming");
  assert.equal(plan.totalHours, 20);
  assert.equal(plan.daysAvailable, 10);
  assert.equal(plan.hoursPerDay, 2);
  assert.equal(plan.pagesPerDay, 20);
  assert.equal(calculateStudyPlan(200, "2026-11-19", 20, "2026-11-09").hoursPerDay, 1);
});

test("counts calendar days across daylight saving changes", () => {
  assert.equal(calculateStudyPlan(40, "2026-03-30", 10, "2026-03-28").daysAvailable, 2);
  assert.equal(calculateStudyPlan(40, "2026-10-26", 10, "2026-10-24").daysAvailable, 2);
  assert.equal(calculateStudyPlan(40, "2028-03-01", 10, "2028-02-28").daysAvailable, 2);
});

test("handles today's exam and a passed deadline without negative or infinite workload", () => {
  const today = calculateStudyPlan(80, "2026-11-09", 10, "2026-11-09");
  assert.equal(today.state, "today");
  assert.equal(today.daysAvailable, 1);
  assert.equal(today.hoursPerDay, 8);
  const past = calculateStudyPlan(80, "2026-11-08", 10, "2026-11-09");
  assert.equal(past.state, "overdue");
  assert.equal(past.daysAvailable, 0);
  assert.equal(past.hoursPerDay, null);
  assert.equal(past.pagesPerDay, null);
});

test("zero uploaded pages means zero hours even with a scheduled exam", () => {
  const plan = calculateStudyPlan(0, "2026-11-19", 10, "2026-11-09");
  assert.equal(plan.totalHours, 0);
  assert.equal(plan.hoursPerDay, 0);
  assert.equal(plan.pagesPerDay, 0);
});

test("an absent or invalid exam date requires scheduling before estimating daily work", () => {
  for (const date of [undefined, "", "2026-02-29", "2026-13-01", "09/11/2026"]) {
    const plan = calculateStudyPlan(120, date, 10, "2026-11-09");
    assert.equal(plan.state, "unscheduled");
    assert.equal(plan.daysAvailable, null);
    assert.equal(plan.hoursPerDay, null);
    assert.equal(plan.totalHours, 12);
  }
  assert.equal(validExamDate("2028-02-29"), true);
  assert.equal(validExamDate("2026-04-31"), false);
  assert.equal(validExamDate("0000-01-01"), false);
});

test("invalid numeric inputs never produce infinite or negative estimates", () => {
  assert.equal(calculateStudyPlan(-20, "2026-11-10", 10, "2026-11-09").totalPages, 0);
  assert.equal(calculateStudyPlan(Number.NaN, "2026-11-10", 10, "2026-11-09").totalHours, 0);
  assert.equal(calculateStudyPlan(100, "2026-11-10", 0, "2026-11-09").totalHours, 10);
  assert.throws(() => calculateStudyPlan(100, "2026-11-10", 10, "not-a-date"), RangeError);
});

test("excludes recurring Sundays and specific Christmas days from study time", () => {
  // Dec 21–27, 2026: seven calendar days, one Sunday and Christmas Friday off.
  const plan = calculateStudyPlan(100, "2026-12-28", 10, "2026-12-21", { nonStudyWeekdays: [0], nonStudyDates: ["2026-12-25"] });
  assert.equal(plan.daysAvailable, 5);
  assert.equal(plan.totalHours, 10);
  assert.equal(plan.hoursPerDay, 2);
  assert.equal(plan.pagesPerDay, 20);
});

test("deduplicates exceptions and never subtracts an already excluded weekday twice", () => {
  const plan = calculateStudyPlan(120, "2026-12-28", 10, "2026-12-21", {
    nonStudyWeekdays: [0, 0],
    nonStudyDates: ["2026-12-25", "2026-12-25", "2026-12-27", "2026-12-28", "2026-12-20", "invalid", "2026-02-30"],
  });
  assert.equal(plan.daysAvailable, 5);
  assert.equal(plan.hoursPerDay, 2.4);
});

test("no available study day returns no daily estimate instead of infinity", () => {
  const plan = calculateStudyPlan(100, "2026-12-28", 10, "2026-12-21", { nonStudyWeekdays: [0, 1, 2, 3, 4, 5, 6] });
  assert.equal(plan.state, "upcoming");
  assert.equal(plan.daysAvailable, 0);
  assert.equal(plan.totalHours, 10);
  assert.equal(plan.hoursPerDay, null);
  assert.equal(plan.pagesPerDay, null);
  const empty = calculateStudyPlan(0, "2026-12-28", 10, "2026-12-21", { nonStudyWeekdays: [0, 1, 2, 3, 4, 5, 6] });
  assert.equal(empty.hoursPerDay, null);
});

test("an exam today has no remaining study time when today is excluded", () => {
  const exception = calculateStudyPlan(100, "2026-12-25", 10, "2026-12-25", { nonStudyDates: ["2026-12-25"] });
  assert.equal(exception.state, "today");
  assert.equal(exception.daysAvailable, 0);
  assert.equal(exception.hoursPerDay, null);
  assert.equal(calculateStudyPlan(100, "2026-12-27", 10, "2026-12-27", { nonStudyWeekdays: [0] }).daysAvailable, 0);
});

test("days off keep unscheduled and past deadlines unchanged and ignore invalid weekdays", () => {
  const availability = { nonStudyWeekdays: [0, 1, 2, 3, 4, 5, 6], nonStudyDates: ["2026-12-25"] };
  assert.equal(calculateStudyPlan(100, undefined, 10, "2026-12-21", availability).daysAvailable, null);
  assert.equal(calculateStudyPlan(100, "2026-12-20", 10, "2026-12-21", availability).state, "overdue");
  assert.equal(calculateStudyPlan(100, "2026-12-28", 10, "2026-12-21", { nonStudyWeekdays: [-1, 7, 1.5, Number.NaN] }).daysAvailable, 7);
});

test("counts recurring days efficiently across whole weeks and leap years", () => {
  // A full 400-year Gregorian cycle has 146097 days, exactly 20871 weeks.
  const plan = calculateStudyPlan(100, "2426-01-01", 10, "2026-01-01", { nonStudyWeekdays: [0] });
  assert.equal(plan.daysAvailable, 146097 - 20871);
});
