import type { StudyAvailability } from "./types";

export const DEFAULT_PAGES_PER_HOUR = 10;

export type StudyPlanState = "unscheduled" | "upcoming" | "today" | "overdue";

export interface StudyPlan {
  totalPages: number;
  totalHours: number;
  pagesPerHour: number;
  /** Available study days before the exam, after recurring and specific days off. */
  daysAvailable: number | null;
  hoursPerDay: number | null;
  pagesPerDay: number | null;
  state: StudyPlanState;
}

const DAY = 24 * 60 * 60 * 1000;

/** Validate a real calendar date, including leap years, without timezone shifts. */
export function validExamDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000-")) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

export function localStudyDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * Estimate workload from all uploaded pages. AI analysis is not study progress.
 * Date arithmetic uses calendar midnights in UTC, so DST does not change the
 * number of study days. The pace is a user-adjustable estimate, not a prediction.
 */
export function calculateStudyPlan(
  pages: number,
  examDate?: string,
  pagesPerHour = DEFAULT_PAGES_PER_HOUR,
  today = localStudyDate(),
  availability: StudyAvailability = {},
): StudyPlan {
  if (!validExamDate(today)) throw new RangeError("La data odierna non è valida.");
  const totalPages = Number.isFinite(pages) ? Math.max(0, Math.floor(pages)) : 0;
  const pace = Number.isFinite(pagesPerHour) && pagesPerHour > 0 ? pagesPerHour : DEFAULT_PAGES_PER_HOUR;
  const base = { totalPages, totalHours: totalPages / pace, pagesPerHour: pace };

  if (!examDate || !validExamDate(examDate)) {
    return { ...base, daysAvailable: null, hoursPerDay: null, pagesPerDay: null, state: "unscheduled" };
  }

  const difference = (Date.parse(`${examDate}T00:00:00.000Z`) - Date.parse(`${today}T00:00:00.000Z`)) / DAY;
  if (difference < 0) {
    return { ...base, daysAvailable: 0, hoursPerDay: null, pagesPerDay: null, state: "overdue" };
  }

  const calendarDays = Math.max(1, difference);
  const start = Date.parse(`${today}T00:00:00.000Z`);
  const excludedWeekdays = new Set((availability.nonStudyWeekdays || []).filter(day => Number.isInteger(day) && day >= 0 && day <= 6));
  const weeks = Math.floor(calendarDays / 7);
  let daysAvailable = weeks * (7 - excludedWeekdays.size);
  const startWeekday = new Date(start).getUTCDay();
  // Whole weeks are counted in one operation; the remaining loop has at most six days.
  for (let index = 0; index < calendarDays % 7; index++) {
    if (!excludedWeekdays.has((startWeekday + index) % 7)) daysAvailable++;
  }
  const end = start + calendarDays * DAY;
  for (const date of new Set(availability.nonStudyDates || [])) {
    if (!validExamDate(date)) continue;
    const timestamp = Date.parse(`${date}T00:00:00.000Z`);
    // A day already excluded by the weekly pattern must not be subtracted twice.
    if (timestamp >= start && timestamp < end && !excludedWeekdays.has(new Date(timestamp).getUTCDay())) daysAvailable--;
  }
  return {
    ...base,
    daysAvailable,
    hoursPerDay: daysAvailable ? base.totalHours / daysAvailable : null,
    pagesPerDay: daysAvailable ? totalPages / daysAvailable : null,
    state: difference === 0 ? "today" : "upcoming",
  };
}
