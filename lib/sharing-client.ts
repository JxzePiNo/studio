"use client";
import { authHeaders } from "./firebase-client";
import { readApiResponse } from "./api-response";
import type { ShareTarget } from "./sharing-types";
export async function sharingRequest<T>(body?: unknown, signal?: AbortSignal, query = ""): Promise<T> {
  return readApiResponse<T>(await fetch(`/api/sharing${query}`, { method: body ? "POST" : "GET", headers: { ...await authHeaders(), ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal, cache: "no-store" }));
}
export function openShare(target: ShareTarget) { window.dispatchEvent(new CustomEvent("studio-share", { detail: target })); }
export function sharingChanged() { window.dispatchEvent(new Event("studio-sharing-changed")); }
