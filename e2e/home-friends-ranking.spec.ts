import { expect, test } from "@playwright/test";
import type { FriendsOverview } from "../lib/friends-types";

for (const width of [1280, 390]) test(`central friends menu shows podium or personal neighbours at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  let selfPlace = 2;
  let hasFriends = true;
  await page.route("**/api/friends**", route => {
    const url = new URL(route.request().url());
    if (route.request().method() === "POST") return route.fulfill({ json: { ok: true } });
    if (url.searchParams.has("activity")) return route.fulfill({ json: { enabled: true, studying: [], online: [], incoming: 0 } });
    const leaderboard = Array.from({ length: 8 }, (_, index) => ({ id: `person${index}`, name: `Studente ${index + 1}`, nickname: `studente${index + 1}`, studyProgram: "Informatica", university: "Roma", durationMs: (8 - index) * 3600000, pages: 8 - index, self: index + 1 === selfPlace }));
    const data: FriendsOverview = { available: true, self: { enabled: true, discoverable: true, shareActivity: true, name: "Alice", nickname: "alice", university: "Roma" }, friends: hasFriends ? [leaderboard[0]] : [], incoming: [], outgoing: [], period: (url.searchParams.get("period") || "day") as FriendsOverview["period"], leaderboard };
    return route.fulfill({ json: data });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const home = page.getByRole("region", { name: "Classifica amici nella home", exact: true });
  const calendar = page.getByRole("region", { name: "Attività di lettura annuale", exact: true });
  await expect(home).toBeVisible(); await expect(calendar).toBeVisible();
  const left = (await home.boundingBox())!, right = (await calendar.boundingBox())!;
  if (width === 1280) { expect(Math.abs(left.width - right.width)).toBeLessThan(2); expect(left.x + left.width).toBeLessThan(right.x); }
  else expect(left.y + left.height).toBeLessThanOrEqual(right.y);
  await page.getByRole("button", { name: /^Amici online:/ }).click();
  const menu = page.getByRole("dialog", { name: "Amici online", exact: true });
  const list = menu.getByRole("list", { name: "Classifica degli amici", exact: true });
  await expect(list.getByRole("listitem")).toHaveCount(3);
  await expect(list.locator('[data-self="true"]')).toContainText("Studente 2");
  await expect(list).toHaveCSS("display", "flex");
  await expect(page.getByRole("button", { name: "Pagine", exact: true })).toHaveCount(0);
  const self = list.locator('[data-self="true"]');
  expect(await self.evaluate(element => {
    const style = getComputedStyle(element);
    return style.color !== style.backgroundColor && getComputedStyle(element.querySelector("strong")!).color === style.color;
  })).toBe(true);
  const today = menu.getByRole("tab", { name: "Oggi", exact: true });
  await expect(today).toHaveCSS("padding-top", "8px");
  await expect(today).toHaveCSS("padding-left", "16px");
  await page.screenshot({ path: `test-results/friends-podium-${width}.png`, fullPage: true });
  selfPlace = 6;
  await menu.getByRole("tab", { name: "Mese", exact: true }).click();
  await expect(list.locator('[data-self="true"]')).toContainText("Studente 6");
  await expect(list.getByRole("listitem").first()).toContainText("Studente 5");
  await expect(list.getByRole("listitem").last()).toContainText("Studente 7");
  await expect(list).not.toHaveCSS("display", "flex");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/friends-personal-ranking-${width}.png`, fullPage: true });
  await menu.getByRole("button", { name: "Chiudi amici online", exact: true }).click();
  hasFriends = false;
  await page.evaluate(() => window.dispatchEvent(new Event("studio-friends-changed")));
  await expect(home).toHaveCount(0);
});
