import { test, expect } from "@playwright/test";
import { defaultPlatform } from "../lib/platform-config";

test("admin shows each user's known cost and distinguishes partial and unavailable consumption", async ({ page }) => {
  const at = "2026-11-17T12:00:00.000Z";
  const mini = { model: "gpt-4.1-mini", input: 1000000, output: 1000000, cached: 200000, total: 2000000, calls: 2, unknown: 0 };
  const usage = (models: Record<string, typeof mini>) => ({ models, calls: 2, errors: 0, firstRecordedAt: at, lastRecordedAt: at });
  const users = [
    { uid: "text", name: "Testo", usage: usage({ mini }) },
    { uid: "partial", name: "Parziale", usage: usage({ mini: { ...mini, calls: 3, unknown: 1 } }) },
    { uid: "none", name: "Nessun dato", usage: null },
    { uid: "unknown", name: "Modello sconosciuto", usage: usage({ mini: { ...mini, model: "unpriced-model" } }) },
  ].map(user => ({ ...user, email: `${user.uid}@example.com`, disabled: false, verified: true, createdAt: at, lastLoginAt: at, lastVisitAt: at, files: { count: 0, bytes: 0, pages: 0 }, activity: null }));
  await page.route("**/api/admin", route => route.fulfill({ json: { users, cursor: null, config: defaultPlatform, audit: [], generatedAt: at } }));
  await page.goto("/admin");
  await expect(page.getByRole("columnheader", { name: "Costo OpenAI stimato", exact: true })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "text@example.com" })).toContainText("1,76");
  await expect(page.getByRole("row").filter({ hasText: "partial@example.com" })).toContainText("Almeno 1,76");
  await expect(page.getByRole("row").filter({ hasText: "partial@example.com" })).toContainText("Stima incompleta");
  await expect(page.getByRole("row").filter({ hasText: "none@example.com" })).toContainText("Non disponibile");
  await expect(page.getByRole("row").filter({ hasText: "unknown@example.com" })).toContainText("Non disponibile");
  await expect(page.getByRole("link", { name: "Listino ufficiale OpenAI" })).toHaveAttribute("href", "https://developers.openai.com/api/docs/pricing");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
