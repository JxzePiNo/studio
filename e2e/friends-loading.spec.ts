import { expect, test } from "@playwright/test";

test("home reveals calendar with ranking and restores friends from cache before network refresh", async ({ page }) => {
  let release = () => {};
  let responseGate = new Promise<void>(resolve => { release = resolve; });
  const bob = { id: "bob", name: "Bob Rossi", nickname: "bob", university: "Roma", studyProgram: "Informatica", durationMs: 600000, pages: 2 };
  await page.route("**/api/friends**", async route => {
    const url = new URL(route.request().url());
    if (!url.searchParams.has("period")) return route.fulfill({ json: { enabled: false, online: [], studying: [], incoming: 0 } });
    await responseGate;
    return route.fulfill({ json: { available: true, self: null, friends: [bob], incoming: [], outgoing: [], leaderboard: [bob], period: "day" } });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const calendar = page.getByRole("region", { name: "Attività di lettura annuale", exact: true });
  const ranking = page.getByRole("region", { name: "Classifica amici nella home", exact: true });
  await expect(page.getByRole("status", { name: "Caricamento attività e classifica", exact: true })).toBeVisible();
  await expect(calendar).toHaveCount(0); await expect(ranking).toHaveCount(0);
  release(); await expect(ranking).toBeVisible(); await expect(calendar).toBeVisible();
  responseGate = new Promise<void>(resolve => { release = resolve; });
  await page.evaluate(() => {
    const key = "studio-friends-v1:local:day";
    const cached = JSON.parse(localStorage.getItem(key)!);
    cached.at = Date.now() - 2 * 86400000;
    localStorage.setItem(key, JSON.stringify(cached));
  });
  bob.durationMs = 1200000;
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(ranking).toBeVisible(); await expect(calendar).toBeVisible();
  await expect(ranking).toContainText("Bob Rossi");
  await expect(ranking).toContainText("0 h 10 min");
  release();
  await page.waitForFunction(() => document.querySelector('[aria-label="Classifica degli amici"]')?.getAnimations().length);
  await expect(ranking).toContainText("0 h 20 min");
  await expect.poll(() => ranking.getByRole("list").evaluate(element => element.getAnimations().length)).toBe(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("studio-friends-v1:local:day")!).value.leaderboard[0].durationMs)).toBe(1200000);
});
