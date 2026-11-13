import test from "node:test";
import assert from "node:assert/strict";
import { resolveTheme, themePreference } from "../lib/theme";

test("theme preferences preserve existing choices and follow system only when selected", () => {
  assert.equal(themePreference("dark"), "dark");
  assert.equal(themePreference(null), "light");
  assert.equal(themePreference("unknown"), "light");
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
});

test("adaptive theme switches at local 08:00 and 20:00 regardless of the system theme", () => {
  for (const [hour, minute, expected] of [[0, 0, "dark"], [7, 59, "dark"], [8, 0, "light"], [19, 59, "light"], [20, 0, "dark"], [23, 59, "dark"]] as const) {
    for (const system of [true, false]) assert.equal(resolveTheme("adaptive", system, new Date(2026, 10, 13, hour, minute)), expected);
  }
});
