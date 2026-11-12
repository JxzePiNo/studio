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

/** Separate month grids keep a week crossing a month boundary from mixing dates. */
export function readingMonthCalendar(activity: ReadingActivity, today: string) {
  const days = readingCalendar(activity, today).flat().filter((day): day is ReadingDay => day !== null);
  const byDate = new Map(days.map(day => [day.date, day]));
  return [...new Set(days.map(day => day.date.slice(0, 7)))].map(month => {
    const first = new Date(`${month}-01T12:00:00`);
    const end = new Date(first.getFullYear(), first.getMonth() + 1, 0, 12);
    const offset = (first.getDay() + 6) % 7;
    const weeks: (ReadingDay | null)[][] = Array.from({ length: Math.ceil((offset + end.getDate()) / 7) }, () => Array(7).fill(null));
    for (let date = 1; date <= end.getDate(); date++) {
      const position = offset + date - 1;
      weeks[Math.floor(position / 7)][position % 7] = byDate.get(`${month}-${String(date).padStart(2, "0")}`) ?? null;
    }
    return { month, weeks };
  });
}
