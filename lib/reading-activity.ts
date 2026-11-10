import { studyDay, type ReadingActivity } from "./study-session";

export type ReadingDay = { date: string; count: number; level: number };

export function readingLevel(count: number) {
  return count <= 0 ? 0 : count < 5 ? 1 : count < 10 ? 2 : count < 20 ? 3 : 4;
}

/** A local-calendar year of days, padded to complete Monday-to-Sunday columns. */
export function readingCalendar(activity: ReadingActivity, today: string): (ReadingDay | null)[][] {
  const end = new Date(`${today}T12:00:00`);
  if (Number.isNaN(end.getTime())) return [];
  const start = new Date(end);
  start.setDate(start.getDate() - 364);
  const firstDay = studyDay(start);
  const cursor = new Date(start);
  cursor.setDate(cursor.getDate() - (cursor.getDay() + 6) % 7);
  const weeks: (ReadingDay | null)[][] = [];
  while (studyDay(cursor) <= today) {
    const week: (ReadingDay | null)[] = [];
    for (let row = 0; row < 7; row++) {
      const date = studyDay(cursor);
      const value = activity[date];
      const count = Number.isSafeInteger(value) && value > 0 ? value : 0;
      week.push(date >= firstDay && date <= today ? { date, count, level: readingLevel(count) } : null);
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}
