export type ReadingActivity = Record<string, number>;
export type StudySession = { day: string; pages: string[]; activity: ReadingActivity; elapsedMs: number; savedElapsedMs?: number; startedAt: number | null; pausedAt?: number; activeStartedAt?: number; activeId?: string; activePages?: string[] };

export function studyDay(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function freshSession(now = Date.now()): StudySession {
  return { day: studyDay(new Date(now)), pages: [], activity: {}, elapsedMs: 0, startedAt: null };
}

function validDay(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && studyDay(new Date(`${value}T12:00:00`)) === value;
}

export function restoreSession(raw: string | null, now = Date.now()): StudySession {
  const empty = freshSession(now);
  try {
    const saved = JSON.parse(raw || "null");
    if (!saved || typeof saved !== "object") return empty;
    const activity: ReadingActivity = {};
    if (saved.activity && typeof saved.activity === "object" && !Array.isArray(saved.activity)) {
      for (const [day, count] of Object.entries(saved.activity).sort(([a], [b]) => b.localeCompare(a)).slice(0, 3660)) {
        if (validDay(day) && day <= empty.day && Number.isSafeInteger(count) && (count as number) >= 0) activity[day] = count as number;
      }
    }
    const savedPages: string[] = Array.isArray(saved.pages) ? [...new Set(saved.pages.filter((key: unknown): key is string => typeof key === "string" && key.length < 200))].slice(0, 10000) as string[] : [];
    // Preserve the previous payload's day when migrating, including yesterday.
    if (typeof saved.day === "string" && validDay(saved.day) && saved.day <= empty.day) activity[saved.day] = savedPages.length;
    return {
      ...empty,
      pausedAt: Number.isFinite(saved.pausedAt) && saved.pausedAt > 0 && saved.pausedAt <= now ? saved.pausedAt : undefined,
      activeId: typeof saved.activeId === "string" ? saved.activeId : undefined,
      activeStartedAt: Number.isFinite(saved.activeStartedAt) && saved.activeStartedAt > 0 && saved.activeStartedAt <= now ? saved.activeStartedAt : undefined,
      activePages: Array.isArray(saved.activePages) ? saved.activePages.filter((value: unknown) => typeof value === "string").slice(0, 10000) : [],
      pages: saved.day === empty.day ? savedPages : [],
      activity,
      elapsedMs: Number.isFinite(saved.elapsedMs) && saved.elapsedMs >= 0 ? saved.elapsedMs : 0,
      savedElapsedMs: Number.isFinite(saved.savedElapsedMs) && saved.savedElapsedMs >= 0 ? saved.savedElapsedMs : 0,
      startedAt: Number.isFinite(saved.startedAt) && saved.startedAt > 0 && saved.startedAt <= now ? saved.startedAt : null,
    };
  } catch { return empty; }
}

export function recordStudyPage(session: StudySession, id: string, page: number, read: boolean, now = Date.now()): StudySession {
  const day = studyDay(new Date(now));
  const pages = new Set(day === session.day ? session.pages : []);
  const key = `${id}:${page}`;
  if (read) pages.add(key); else pages.delete(key);
  const activePages = new Set(session.activePages || []);
  if (session.startedAt !== null) { if (read) activePages.add(key); else activePages.delete(key); }
  return { ...session, activePages: [...activePages], day, pages: [...pages], activity: { ...session.activity, [session.day]: session.pages.length, [day]: pages.size } };
}

export function sessionElapsed(session: StudySession, now = Date.now()) {
  return session.elapsedMs + (session.startedAt === null ? 0 : Math.max(0, now - session.startedAt));
}

/** Saved intervals plus the active interval not checkpointed yet, in local time. */
export function dailyStudyElapsed(session: StudySession, sessions: { startedAt: string; endedAt: string; durationMs: number; timeRanges?: [number, number][] }[], now = Date.now()) {
  const date = new Date(now);
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
  const overlap = (from: number, to: number) => Math.max(0, Math.min(to, end) - Math.max(from, start));
  const saved = sessions.reduce((total, item) => total + (item.timeRanges || [[Date.parse(item.endedAt) - item.durationMs, Date.parse(item.endedAt)]]).reduce((sum, [from, to]) => sum + overlap(from, to), 0), 0);
  const pending = Math.max(0, sessionElapsed(session, now) - (session.savedElapsedMs || 0));
  const until = session.startedAt === null ? (session.pausedAt ?? now) : now;
  return saved + overlap(until - pending, until);
}

export function pauseStudyTimer(session: StudySession, now = Date.now()): StudySession {
  if (session.startedAt === null) return session;
  return { ...session, pausedAt: now, activeStartedAt: session.activeStartedAt ?? session.startedAt, elapsedMs: sessionElapsed(session, now), startedAt: null };
}

export function startStudyTimer(session: StudySession, id: string, now = Date.now()): StudySession {
  if (session.startedAt !== null) return session;
  return session.activeId
    ? { ...session, startedAt: now }
    : { ...session, startedAt: now, activeStartedAt: now, elapsedMs: 0, savedElapsedMs: 0, activeId: id, activePages: [] };
}
