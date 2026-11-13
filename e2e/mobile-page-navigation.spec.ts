import { expect, test } from "@playwright/test";

test("mobile pages start at the top on navigation, history and repeated Home taps", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 640 });
  const friends = Array.from({ length: 25 }, (_, index) => ({ id: `friend${index}`, name: `Amico ${index}`, nickname: `amico${index}`, studyProgram: "Informatica", university: "Roma" }));
  await page.route("**/api/friends**", route => {
    const url = new URL(route.request().url());
    if (route.request().method() === "POST" || url.searchParams.has("activity")) return route.fulfill({ json: { enabled: false, online: [], studying: [], incoming: 0 } });
    if (url.searchParams.has("search")) return route.fulfill({ json: { people: [], truncated: false } });
    return route.fulfill({ json: { available: true, self: null, friends, incoming: [], outgoing: [], leaderboard: [], period: "day" } });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const navigation = page.getByRole("navigation", { name: "Navigazione principale", exact: true });
  const scrollDown = async () => {
    await page.evaluate(() => window.scrollTo({ top: 350, behavior: "instant" }));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  };
  const atTop = async () => { await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0); };
  await expect(navigation).toBeVisible();
  await scrollDown();
  await navigation.getByRole("button", { name: "Amici", exact: true }).click();
  await expect(page).toHaveURL(/\/amici$/); await atTop();
  await expect(page.getByText("Amico 24", { exact: true })).toBeAttached();
  await scrollDown();
  await navigation.getByRole("button", { name: "Sessioni", exact: true }).click();
  await expect(page).toHaveURL(/\/sessioni$/); await atTop();
  await page.goBack(); await expect(page).toHaveURL(/\/amici$/); await atTop();
  await page.goBack(); await expect(page).toHaveURL(/\/$/); await atTop();
  await scrollDown();
  await navigation.getByRole("button", { name: "Home", exact: true }).click(); await atTop();
});
