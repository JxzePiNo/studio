"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "light" | "dark";
const ThemeContext = createContext({ theme: "light" as Theme, setTheme: (_theme: Theme) => {} });
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, update] = useState<Theme>("light");
  useEffect(() => {
    update(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
    const sync = (event: StorageEvent) => {
      if (event.key !== "studio-theme") return;
      const value = event.newValue === "dark" ? "dark" : "light";
      document.documentElement.dataset.theme = value; update(value);
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  function setTheme(value: Theme) {
    update(value); document.documentElement.dataset.theme = value;
    try { localStorage.setItem("studio-theme", value); } catch {}
  }
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}
export const useTheme = () => useContext(ThemeContext);
