"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { authHeaders } from "@/lib/firebase-client";
import { readApiResponse } from "@/lib/api-response";
import { normalizeTourSeen, type TourSection, type TourSeen } from "@/lib/tony-tours";

type TourContext = { seen: TourSeen; loading: boolean; error: string; requested: TourSection | null; requestTour: (section: TourSection) => void; consumeRequest: () => void; markSeen: (section: TourSection) => Promise<void>; reload: () => Promise<void> };
const Context = createContext<TourContext | null>(null);

export function TonyTourProvider({ children }: { children: ReactNode }) {
  const [seen, setSeen] = useState(() => normalizeTourSeen(null));
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [requested, setRequested] = useState<TourSection | null>(null);
  const revision = useRef(0), mounted = useRef(true);
  const reload = useCallback(async () => {
    const current = ++revision.current;
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/tours", { headers: await authHeaders(), cache: "no-store" });
      const result = await readApiResponse<TourSeen>(response);
      if (mounted.current && revision.current === current) setSeen(normalizeTourSeen(result));
    } catch { if (mounted.current && revision.current === current) setError("Non riesco a caricare i tour di Tony. Puoi riprovare da qui."); }
    finally { if (mounted.current && revision.current === current) setLoading(false); }
  }, []);
  useEffect(() => { mounted.current = true; void reload(); return () => { mounted.current = false; revision.current++; }; }, [reload]);
  const markSeen = useCallback(async (section: TourSection) => {
    revision.current++;
    setSeen(current => ({ ...current, [section]: true }));
    try {
      await readApiResponse(await fetch("/api/tours", { method: "PATCH", headers: { "Content-Type": "application/json", ...await authHeaders() }, body: JSON.stringify({ section, seen: true }) }));
      if (mounted.current) setError("");
    } catch { if (mounted.current) setError("Il tour è terminato, ma non ho potuto salvarlo. Potrebbe ricomparire al prossimo accesso."); }
  }, []);
  const requestTour = useCallback((section: TourSection) => setRequested(section), []);
  const consumeRequest = useCallback(() => setRequested(null), []);
  return <Context.Provider value={{ seen, loading, error, requested, requestTour, consumeRequest, markSeen, reload }}>{children}</Context.Provider>;
}
export function useTonyTours() {
  const value = useContext(Context);
  if (!value) throw new Error("I tour richiedono TonyTourProvider.");
  return value;
}
