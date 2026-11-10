"use client";

import { useCallback, useSyncExternalStore } from "react";
import { browserAuth, firebaseEnabled } from "@/lib/firebase-client";

export type ReaderDisplay = { navigation: boolean; hints: boolean };
const defaults: ReaderDisplay = { navigation: true, hints: true };
const fallback = new Map<string, string>();
const eventName = "studio-reader-display-changed";
function parse(value: string | null): ReaderDisplay {
  try { const saved = JSON.parse(value || "{}"); return { navigation: saved.navigation !== false, hints: saved.hints !== false }; }
  catch { return defaults; }
}

export function useReaderDisplay(documentId?: string) {
  const uid = typeof window === "undefined" ? "" : firebaseEnabled ? browserAuth().currentUser?.uid : "local";
  const key = documentId && uid ? `studio-reader-display:${uid}:${documentId}` : "";
  const read = useCallback(() => {
    if (!key) return null;
    if (fallback.has(key)) return fallback.get(key)!;
    try { return localStorage.getItem(key); } catch { return null; }
  }, [key]);
  const subscribe = useCallback((notify: () => void) => {
    const storage = (event: StorageEvent) => { if (!event.key || event.key === key) { fallback.delete(key); notify(); } };
    window.addEventListener(eventName, notify); window.addEventListener("storage", storage);
    return () => { window.removeEventListener(eventName, notify); window.removeEventListener("storage", storage); };
  }, [key]);
  const snapshot = useSyncExternalStore(subscribe, read, () => null);
  const setVisible = useCallback((field: keyof ReaderDisplay, visible: boolean) => {
    if (!key) return;
    const value = JSON.stringify({ ...parse(read()), [field]: visible });
    try { localStorage.setItem(key, value); fallback.delete(key); } catch { fallback.set(key, value); }
    window.dispatchEvent(new Event(eventName));
  }, [key, read]);
  return { display: parse(snapshot), setVisible };
}
