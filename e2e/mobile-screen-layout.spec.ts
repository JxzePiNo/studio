import { expect, test } from "@playwright/test";
import { defaultPlatform } from "../lib/platform-config";

for (const width of [390, 700]) test(`mobile sections start below the top controls at ${width}px`, async ({ page, request }) => {
  await page.setViewportSize({ width, height: 844 });
  const folder = await (await request.post("/api/folders", { data: { name: `Layout mobile ${Date.now()}` } })).json();
  try {
    for (const [url, selector] of [["/", ".overview-page > header"], ["/sessioni", ".overview-page > header"], ["/inviti", 'section[aria-label="Inviti e saluti"] > header'], [`/esami/${folder.id}`, ".course-header"]]) {
      await page.goto(url);
      const header = page.locator(selector).first();
      await expect(header).toBeVisible();
      const bounds = (await header.boundingBox())!;
      const bell = (await page.getByRole("button", { name: /^Mostra notifiche/ }).boundingBox())!;
      expect(bounds.y).toBeGreaterThanOrEqual(bell.y + bell.height);
      expect(bounds.y).toBeLessThanOrEqual(bell.y + bell.height + 24);
      await expect(page.getByRole("navigation", { name: "Navigazione principale", exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  } finally { await request.delete(`/api/folders/${folder.id}`); }
});

test("mobile admin shares bottom navigation, uses Tony while loading and keeps the dotted canvas", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/admin", async route => { await waiting; await route.fulfill({ json: { users: [], cursor: null, config: defaultPlatform, audit: [], generatedAt: new Date().toISOString() } }); });
  try {
    await page.goto("/admin");
    await expect(page.getByRole("status", { exact: false }).filter({ hasText: "Carico la dashboard." })).toBeVisible();
    await expect(page.locator('[aria-busy="true"] svg').first()).toBeVisible();
    const bottom = page.getByRole("navigation", { name: "Navigazione principale", exact: true });
    for (const label of ["Home", "Sessioni", "Inviti", "Account"]) await expect(bottom.getByRole("button", { name: label, exact: true })).toBeVisible();
    release();
    const heading = page.getByRole("heading", { name: "Utenti", exact: true });
    await expect(heading).toBeVisible();
    const bounds = (await heading.boundingBox())!;
    expect(bounds.y).toBeLessThan(90);
    await expect(page.locator(".main-shell > div").first()).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    expect(await page.locator(".main-shell").evaluate(element => getComputedStyle(element, "::before").backgroundImage)).toContain("radial-gradient");
    await page.getByRole("button", { name: "Apri menu", exact: true }).click();
    await expect(page.getByRole("navigation", { name: "Sezioni amministrazione" }).getByRole("link", { name: "Home", exact: true })).toHaveAttribute("href", "/");
    await page.getByRole("button", { name: "Costi", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Navigazione Studio", exact: true })).toHaveCount(0);
    await bottom.getByRole("button", { name: "Inviti", exact: true }).click();
    await expect(page).toHaveURL(/\/inviti$/);
  } finally { release(); }
});
