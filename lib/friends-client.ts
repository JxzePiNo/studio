"use client";
import { authHeaders, browserAuth, firebaseEnabled } from "./firebase-client";
import { readApiResponse } from "./api-response";
import type { FriendsOverview, FriendsPeriod } from "./friends-types";

const snapshots = new Map<string, { at: number; value: FriendsOverview }>();
const generations = new Map<string, number>();
const owner = () => firebaseEnabled ? browserAuth().currentUser?.uid : "local";
const keyFor = (uid: string, period: string) => `studio-friends-v1:${uid}:${period}`;
export function cachedFriends(period: FriendsPeriod): FriendsOverview | null {
  const uid = owner(); if (!uid || typeof window === "undefined") return null;
  const key = keyFor(uid, period);
  try {
    const cached = snapshots.get(key) || JSON.parse(localStorage.getItem(key) || "null");
    if (!cached || Date.now() - cached.at > 30 * 86400000 || cached.value.period !== period || !Array.isArray(cached.value.friends) || !Array.isArray(cached.value.leaderboard)) return null;
    return structuredClone(cached.value);
  } catch { return null; }
}
function invalidate(uid: string) {
  generations.set(uid, (generations.get(uid) || 0) + 1);
  for (const period of ["day", "month", "all"]) {
    const key = keyFor(uid, period); snapshots.delete(key);
    try { localStorage.removeItem(key); } catch { /* Storage may be unavailable. */ }
  }
}

export async function friendsRequest<T>(query = "", body?: unknown, signal?: AbortSignal): Promise<T> {
  const uid = owner();
  const generation = uid ? generations.get(uid) || 0 : 0;
  const value = await readApiResponse<T>(await fetch(`/api/friends${query}`, { method: body ? "POST" : "GET", headers: { ...await authHeaders(), ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal, cache: "no-store" }));
  if (uid && uid === owner() && body && (body as { action?: string }).action !== "presence") invalidate(uid);
  if (uid && uid === owner() && !signal?.aborted && !body && /^\?period=(day|month|all)$/.test(query) && generation === (generations.get(uid) || 0)) {
    const overview = value as FriendsOverview;
    const key = keyFor(uid, overview.period);
    const entry = { at: Date.now(), value: overview }; snapshots.set(key, entry);
    try {
      // Ranking snapshots do not need the large profile image payloads.
      const json = JSON.stringify(entry, (field, content) => field === "photoURL" ? undefined : content);
      localStorage.setItem(key, json);
    } catch { /* Keep the memory cache if storage is full. */ }
  }
  return value;
}
export function friendsChanged() { window.dispatchEvent(new Event("studio-friends-changed")); }
