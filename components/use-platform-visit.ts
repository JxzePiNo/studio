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
      const attempt = new AbortController();
      const cancel = () => attempt.abort();
      abort.signal.addEventListener("abort", cancel, { once: true });
      const timer = setTimeout(cancel, 15_000);
      try {
        const headers = await authHeaders();
        if (disposed || attempt.signal.aborted) return false;
        const response = await fetch("/api/visits", { method: "POST", headers, cache: "no-store", signal: attempt.signal });
        return response.ok;
      } finally { clearTimeout(timer); abort.signal.removeEventListener("abort", cancel); }
    });
    return () => { disposed = true; detach(); abort.abort(); };
  }, [uid, enabled]);
}
