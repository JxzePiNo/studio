"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { resolveTheme, themePreference, type Theme, type ThemePreference } from "@/lib/theme";

const ThemeContext = createContext({ theme: "light" as Theme, preference: "light" as ThemePreference, setTheme: (_theme: ThemePreference) => {} });
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, update] = useState<Theme>("light");
  const [preference, setPreference] = useState<ThemePreference | null>(null);
  useEffect(() => {
    try { setPreference(themePreference(localStorage.getItem("studio-theme"))); } catch { setPreference("light"); }
    const sync = (event: StorageEvent) => {
      if (event.key !== "studio-theme" && event.key !== null) return;
      setPreference(themePreference(event.newValue));
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => {
    if (!preference) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const apply = () => {
      clearTimeout(timer);
      const now = new Date();
      const value = resolveTheme(preference, media.matches, now);
      document.documentElement.dataset.theme = value; update(value);
      if (preference === "adaptive") {
        const next = new Date(now);
        next.setHours(now.getHours() < 8 ? 8 : now.getHours() < 20 ? 20 : 32, 0, 0, 0);
        timer = setTimeout(apply, next.getTime() - now.getTime());
      }
    };
    apply();
    media.addEventListener("change", apply);
    window.addEventListener("focus", apply);
    document.addEventListener("visibilitychange", apply);
    return () => { clearTimeout(timer); media.removeEventListener("change", apply); window.removeEventListener("focus", apply); document.removeEventListener("visibilitychange", apply); };
  }, [preference]);
  function setTheme(value: ThemePreference) {
    setPreference(value);
    try { localStorage.setItem("studio-theme", value); } catch {}
  }
  return <ThemeContext.Provider value={{ theme, preference: preference || "light", setTheme }}>{children}</ThemeContext.Provider>;
}
export const useTheme = () => useContext(ThemeContext);
