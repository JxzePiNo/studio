export type Theme = "light" | "dark";
export type ThemePreference = Theme | "system" | "adaptive";

export function themePreference(value: unknown): ThemePreference {
  return value === "dark" || value === "system" || value === "adaptive" ? value : "light";
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean, date = new Date()): Theme {
  if (preference === "system") return systemDark ? "dark" : "light";
  if (preference === "adaptive") return date.getHours() >= 20 || date.getHours() < 8 ? "dark" : "light";
  return preference;
}
