"use client";
import { useEffect } from "react";
import { authHeaders } from "@/lib/firebase-client";
import { reportPlatformVisits } from "@/lib/platform-visit-client";

export function usePlatformVisit(uid: string | undefined, enabled: boolean) {
  useEffect(() => {
    if (!uid || !enabled) return;
    let disposed = false;
    const abort = new AbortController();
    const detach = reportPlatformVisits(async () => {
      const headers = await authHeaders();
      if (disposed) return false;
      const response = await fetch("/api/visits", { method: "POST", headers, cache: "no-store", signal: abort.signal });
      return response.ok;
    });
    return () => { disposed = true; detach(); abort.abort(); };
  }, [uid, enabled]);
}
