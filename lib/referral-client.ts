import { authHeaders } from "./firebase-client";
import { readApiResponse } from "./api-response";

export async function referralRequest<T>(body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch("/api/referrals", { method: body ? "POST" : "GET", headers: { ...await authHeaders(), ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal, cache: "no-store" });
  return readApiResponse<T>(response);
}

export const referralStorageKey = "studio-pending-referral";
/** First link wins until sign-in; a visit alone never creates a referral. */
export function captureReferral(url: URL, storage: Pick<Storage, "getItem" | "setItem" | "removeItem">, now = Date.now()): string | undefined {
  let pending: { code: string; expiresAt: number } | undefined;
  try { pending = JSON.parse(storage.getItem(referralStorageKey) || "null") || undefined; } catch {}
  if (pending && (!/^[a-f0-9]{24}$/.test(pending.code) || !Number.isFinite(pending.expiresAt) || pending.expiresAt <= now)) { storage.removeItem(referralStorageKey); pending = undefined; }
  const code = url.searchParams.get("ref");
  if (!pending && code && /^[a-f0-9]{24}$/.test(code)) {
    pending = { code, expiresAt: now + 30 * 86400000 };
    storage.setItem(referralStorageKey, JSON.stringify(pending));
  }
  return pending?.code;
}
