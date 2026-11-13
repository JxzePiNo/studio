import { expect, test } from "@playwright/test";

for (const width of [320, 390, 700, 1280]) test(`reading calendar separates months and shows the recent window at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install({ time: new Date("2026-03-02T12:00:00+01:00") });
  await page.goto("/");
  const heatmap = page.getByRole("region", { name: "Attività di lettura annuale", exact: true });
  const scroller = heatmap.locator('[aria-label="Calendario di lettura, scorri per vedere i mesi precedenti"]');
  const recentButton = width > 700 ? "Ultimi quattro mesi" : "Ultimi due mesi";
  const previous = heatmap.locator(width > 700 ? '[data-month="2025-12"]' : '[data-month="2026-02"]'), current = heatmap.locator('[data-month="2026-03"]');
  await expect(current).toBeVisible();
  await expect(heatmap.locator("button[data-date]")).toHaveCount(365);
  const recentFits = async () => {
    const area = (await scroller.boundingBox())!, left = (await previous.boundingBox())!, right = (await current.boundingBox())!;
    return left.x >= area.x && left.x + left.width <= area.x + area.width + 2 && right.x >= area.x && right.x + right.width <= area.x + area.width + 2;
  };
  await expect.poll(recentFits).toBe(true);
  await expect(previous.getByRole("heading")).toHaveText(width > 700 ? "dicembre 2025" : "febbraio 2026");
  await expect(current.getByRole("heading")).toHaveText("marzo 2026");
  await expect(previous.locator('button[data-date^="2026-03"]')).toHaveCount(0);
  await scroller.evaluate(element => { element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); element.scrollLeft = 0; });
  await expect(heatmap.getByRole("button", { name: recentButton, exact: true })).toBeEnabled();
  await page.setViewportSize({ width: width === 700 ? 690 : width + 5, height: 844 });
  await expect.poll(() => scroller.evaluate(element => element.scrollLeft)).toBe(0);
  await heatmap.getByRole("button", { name: recentButton, exact: true }).click();
  await expect.poll(recentFits).toBe(true);
  await expect(heatmap.getByRole("button", { name: recentButton, exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/reading-months-${width}.png` });
});

test("empty daily sessions have a white card and no storage-limit note", async ({ page }) => {
  await page.route("**/api/study-sessions?*", route => route.request().method() === "GET" ? route.fulfill({ json: { sessions: [], activity: {} } }) : route.continue());
  await page.goto("/sessioni?giorno=2026-03-01");
  const heading = page.getByRole("heading", { name: "Nessuna sessione con timer in questo giorno.", exact: true });
  await expect(heading).toBeVisible();
  await expect(heading.locator("..")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(page.getByText(/L’elenco mostra le ultime 500/)).toHaveCount(0);
});
