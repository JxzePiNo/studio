import { isStudyMaterial } from "./document-study";
import type { DocumentSummary, ExamFolder } from "./types";
import type { SavedStudySession } from "./study-history";
import { calculateStudyPlan, DEFAULT_PAGES_PER_HOUR, localStudyDate, validExamDate } from "./study-plan";

const HOUR = 3600000;
export function addStudyDays(day: string, days: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function estimateCoursePace(folder: ExamFolder, documents: DocumentSummary[], sessions: SavedStudySession[], today = localStudyDate()) {
  const initial = Number.isFinite(folder.pagesPerHour) && folder.pagesPerHour! > 0 ? folder.pagesPerHour! : DEFAULT_PAGES_PER_HOUR;
  const courses = new Map(documents.filter(isStudyMaterial).map(document => [document.id, document.folderId]));
  const earliest = addStudyDays(today, -30);
  const relevant = sessions.filter(session => {
    if (session.day < earliest || (session.endDay || session.day) > today || session.durationMs < 60000 || !session.pages.length) return false;
    return session.pages.every(page => courses.get(page.documentId) === folder.id);
  }).sort((a, b) => b.endedAt.localeCompare(a.endedAt)).slice(0, 20);
  // Merged sessions preserve their active ranges. Merge overlaps across records
  // too, so duplicate saves or simultaneous timers do not inflate study time.
  const ranges = relevant.flatMap(session => session.timeRanges || [[Date.parse(session.startedAt), Math.min(Date.parse(session.endedAt), Date.parse(session.startedAt) + session.durationMs)] as [number, number]]).filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end > start).sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [start, end] of ranges) {
    const last = merged.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  const hours = merged.reduce((sum, [start, end]) => sum + (end - start) / HOUR, 0);
  const pages = new Set(relevant.flatMap(session => session.pages.map(page => `${page.documentId}:${page.page}`))).size;
  const measured = hours >= 5 / 60 && pages > 0 ? pages / hours : null;
  // Two hours of the initial estimate avoid abrupt changes after a short sample.
  const effective = measured === null ? initial : (initial * 2 + pages) / (2 + hours);
  return { initial, effective, measured, hours, pages, sessions: relevant.length };
}

export function buildStudyCalendar(folders: ExamFolder[], documents: DocumentSummary[], sessions: SavedStudySession[], today = localStudyDate()) {
  if (!validExamDate(today)) throw new RangeError("Data non valida");
  return folders.filter(folder => !folder.archived).map(folder => {
    const materials = documents.filter(document => document.folderId === folder.id && isStudyMaterial(document));
    const totalPages = materials.reduce((sum, document) => sum + Math.max(0, document.pages), 0);
    const remainingPages = materials.reduce((sum, document) => sum + Math.max(0, document.pages - Math.min(document.pages, Math.max(0, document.readPages || 0))), 0);
    const pace = estimateCoursePace(folder, documents, sessions, today);
    const plan = calculateStudyPlan(remainingPages, folder.examDate, pace.effective, today, folder);
    return { folder, totalPages, remainingPages, pace, plan, today };
  });
}

export type CourseCalendarPlan = ReturnType<typeof buildStudyCalendar>[number];
export function studyTasksForDay(plans: CourseCalendarPlan[], day: string) {
  if (!validExamDate(day)) return [];
  return plans.flatMap(course => {
    const { folder, remainingPages, plan, today } = course;
    if (day < today || !remainingPages || !folder.examDate || day > folder.examDate || (day === folder.examDate && day !== today) || !plan.daysAvailable || plan.state === "overdue") return [];
    if (folder.nonStudyWeekdays?.includes(new Date(`${day}T12:00:00Z`).getUTCDay()) || folder.nonStudyDates?.includes(day)) return [];
    const before = day === today ? 0 : calculateStudyPlan(remainingPages, day, course.pace.effective, today, folder).daysAvailable || 0;
    const base = Math.floor(remainingPages / plan.daysAvailable);
    const pages = base + (before < remainingPages % plan.daysAvailable ? 1 : 0);
    return pages ? [{ course, pages, hours: pages / course.pace.effective }] : [];
  });
}
