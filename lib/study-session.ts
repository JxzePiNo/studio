export type ReadingActivity = Record<string, number>;
export type StudySession = { day: string; pages: string[]; activity: ReadingActivity; elapsedMs: number; startedAt: number | null; activeStartedAt?: number; activeId?: string; activePages?: string[] };

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
      activeId: typeof saved.activeId === "string" ? saved.activeId : undefined,
      activeStartedAt: Number.isFinite(saved.activeStartedAt) && saved.activeStartedAt > 0 && saved.activeStartedAt <= now ? saved.activeStartedAt : undefined,
      activePages: Array.isArray(saved.activePages) ? saved.activePages.filter((value: unknown) => typeof value === "string").slice(0, 10000) : [],
      pages: saved.day === empty.day ? savedPages : [],
      activity,
      elapsedMs: Number.isFinite(saved.elapsedMs) && saved.elapsedMs >= 0 ? saved.elapsedMs : 0,
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

export function pauseStudyTimer(session: StudySession, now = Date.now()): StudySession {
  if (session.startedAt === null) return session;
  return { ...session, activeStartedAt: session.activeStartedAt ?? session.startedAt, elapsedMs: sessionElapsed(session, now), startedAt: null };
}

export function startStudyTimer(session: StudySession, id: string, now = Date.now()): StudySession {
  if (session.startedAt !== null) return session;
  return session.activeId
    ? { ...session, startedAt: now }
    : { ...session, startedAt: now, activeStartedAt: now, elapsedMs: 0, activeId: id, activePages: [] };
}
