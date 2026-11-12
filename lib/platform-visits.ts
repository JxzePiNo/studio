import type { Firestore } from "@google-cloud/firestore";
import { MemoryCache } from "./memory-cache";

/** Server timestamps only; merge with question metrics without replacing them. */
export async function recordPlatformVisit(db: Firestore, uid: string, now = new Date(), coalesceMs = 15_000) {
  const reference = db.collection("users").doc(uid).collection("metrics").doc("activity");
  return db.runTransaction(async transaction => {
    const previous = await transaction.get(reference);
    const last = previous.get("lastVisitAt") as string | undefined;
    // Focus and visibility events can describe the same entry, across tabs too.
    if (last && now.getTime() - Date.parse(last) < coalesceMs) return last;
    const at = now.toISOString();
    transaction.set(reference, { lastVisitAt: at }, { merge: true });
    return at;
  });
}

/** Polling and background analysis must not make an absent user look present. */
export function recordsPlatformActivity(request: Request) {
  const path = new URL(request.url).pathname;
  if (path === "/api/visits" || path.startsWith("/api/admin") || path.endsWith("/analyze")) return false;
  if (path === "/api/study-sessions" && request.method === "POST") return false;
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return request.method === "GET" && (path === "/api/profile" || /^\/api\/documents\/[^/]+\/pdf$/.test(path));
  // Automatic greeting polls/acknowledgements are not a deliberate visit.
  return !path.startsWith("/api/referrals");
}

const observed = new WeakMap<Firestore, { recent: MemoryCache<boolean>; pending: Map<string, Promise<void>> }>();
export async function recordAuthenticatedActivity(db: Firestore, uid: string) {
  let state = observed.get(db);
  if (!state) {
    state = { recent: new MemoryCache({ maxEntries: 5000, maxBytes: 1_000_000, ttlMs: 60_000 }), pending: new Map() };
    observed.set(db, state);
  }
  if (state.recent.get(uid)) return;
  const waiting = state.pending.get(uid); if (waiting) return waiting;
  const cache = state;
  const work = recordPlatformVisit(db, uid, new Date(), 60_000).then(() => { cache.recent.set(uid, true, uid.length * 2 + 16); }).finally(() => cache.pending.delete(uid));
  cache.pending.set(uid, work);
  return work;
}

/** Historical questions prove platform use, unlike the Firebase login timestamp. */
export function lastKnownPlatformVisit(activity?: { lastVisitAt?: unknown; lastRecordedAt?: unknown } | null) {
  const dates = [activity?.lastVisitAt, activity?.lastRecordedAt].filter((value): value is string => typeof value === "string" && Number.isFinite(Date.parse(value)));
  return dates.sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
}
