import { z } from "zod";

export const studyDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => { const date = new Date(`${value}T12:00:00Z`); return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value; }, "Data non valida");
const pageSchema = z.object({ documentId: z.string().uuid(), page: z.number().int().min(1).max(1000), name: z.string().trim().max(200).optional() }).strict();
export const savedSessionInputSchema = z.object({
  id: z.string().uuid(), startedAt: z.string().datetime(), endedAt: z.string().datetime(), day: studyDateSchema,
  durationMs: z.number().int().min(0).max(7 * 86400000), pages: z.array(pageSchema).max(10000),
}).strict().refine(value => Date.parse(value.endedAt) >= Date.parse(value.startedAt) && value.durationMs <= Date.parse(value.endedAt) - Date.parse(value.startedAt) + 1000, "Durata non valida");
export const readingEventSchema = pageSchema.omit({ name: true }).extend({ day: studyDateSchema, read: z.boolean() }).strict();
export const studyHistoryInputSchema = z.discriminatedUnion("type", [
  readingEventSchema.extend({ type: z.literal("read") }),
  z.object({ type: z.literal("session"), session: savedSessionInputSchema }).strict(),
  z.object({ type: z.literal("import-activity"), activity: z.record(studyDateSchema, z.number().int().min(0).max(1000000)) }).strict(),
]);
export type ReadingEvent = z.infer<typeof readingEventSchema>;
export type SavedSessionInput = z.infer<typeof savedSessionInputSchema>;
export type SavedStudySession = SavedSessionInput & { pagesRead: number; documents: { id: string; name: string; pagesRead: number }[]; mergedCount?: number; endDay?: string; timeRanges?: [number, number][] };
export const sessionIdsSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) }).strict();
export const mergeSessionsSchema = sessionIdsSchema.extend({ action: z.literal("merge") }).refine(value => new Set(value.ids).size >= 2 && value.ids.length <= 499, "Seleziona almeno due sessioni");

export function mergeSavedSessions(sessions: SavedStudySession[], id: string): SavedStudySession {
  if (sessions.length < 2) throw Object.assign(new Error("Seleziona almeno due sessioni esistenti."), { status: 409 });
  const sorted = [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const startedAt = sorted[0].startedAt;
  const endedAt = sessions.reduce((last, session) => session.endedAt > last ? session.endedAt : last, startedAt);
  const ranges = sessions.flatMap(session => session.timeRanges || [[Date.parse(session.startedAt), Math.min(Date.parse(session.endedAt), Date.parse(session.startedAt) + session.durationMs)] as [number, number]]).sort((a, b) => a[0] - b[0]);
  const timeRanges: [number, number][] = [];
  for (const [start, end] of ranges) { const last = timeRanges.at(-1); if (last && start <= last[1]) last[1] = Math.max(last[1], end); else timeRanges.push([start, end]); }
  const pages = [...new Map(sessions.flatMap(session => session.pages).map(page => [`${page.documentId}:${page.page}`, page])).values()];
  const documents = new Map<string, { id: string; name: string; pagesRead: number }>();
  for (const page of pages) { const document = documents.get(page.documentId) || { id: page.documentId, name: page.name || "PDF", pagesRead: 0 }; document.pagesRead++; documents.set(document.id, document); }
  return { id, startedAt, endedAt, day: sorted[0].day, endDay: sessions.reduce((last, session) => (session.endDay || session.day) > last ? session.endDay || session.day : last, sorted[0].day), durationMs: timeRanges.reduce((sum, [start, end]) => sum + end - start, 0), pages, pagesRead: pages.length, documents: [...documents.values()], timeRanges, mergedCount: sessions.reduce((sum, session) => sum + (session.mergedCount || 1), 0) };
}
export type StudyHistorySnapshot = { sessions: SavedStudySession[]; activity: Record<string, number>; todayPages: string[] };

export function buildSavedSession(input: SavedSessionInput): SavedStudySession {
  const parsed = savedSessionInputSchema.parse(input);
  const pages = [...new Map(parsed.pages.map(page => [`${page.documentId}:${page.page}`, page])).values()];
  const documents = new Map<string, { id: string; name: string; pagesRead: number }>();
  for (const page of pages) {
    const entry = documents.get(page.documentId) || { id: page.documentId, name: page.name || "PDF", pagesRead: 0 };
    entry.pagesRead++; documents.set(page.documentId, entry);
  }
  return { ...parsed, pages, pagesRead: pages.length, documents: [...documents.values()] };
}
