import { expect, test } from "@playwright/test";
import { defaultPlatform } from "../lib/platform-config";

test("admin users default to latest visits with editable order and an online dot", async ({ page }) => {
  const now = new Date().toISOString();
  const users = [
    { uid: "alice", name: "Alice", email: "alice@example.com", createdAt: "2026-01-01", lastVisitAt: "2026-01-01" },
    { uid: "bob", name: "Bob", email: "bob@example.com", createdAt: "2026-01-02", lastVisitAt: now },
    { uid: "unknown", name: "Zoe", email: "zoe@example.com", createdAt: "2026-01-03", lastVisitAt: null },
  ].map(user => ({ ...user, disabled: false, verified: true, lastLoginAt: null, usage: null, files: { count: 0, pages: 0, bytes: 0 }, activity: null }));
  await page.route(/\/api\/admin(?:\?.*)?$/, route => route.fulfill({ json: { users, config: defaultPlatform, audit: [], cursor: null, generatedAt: now } }));
  await page.goto("/admin");
  const rows = page.locator("tbody tr");
  await expect(rows.first()).toContainText("bob@example.com");
  await expect(page.getByRole("columnheader", { name: "Stato", exact: true })).toHaveCount(0);
  await expect(rows.first().getByRole("img", { name: "Online adesso", exact: true })).toBeVisible();
  const order = page.getByRole("combobox", { name: "Ordina utenti", exact: true });
  await expect(order).toContainText("Ultimo accesso");
  await order.click(); await page.getByRole("option", { name: "Nome", exact: true }).click();
  await expect(rows.first()).toContainText("alice@example.com");
  await order.click(); await page.getByRole("option", { name: "Registrazione più recente", exact: true }).click();
  await expect(rows.first()).toContainText("zoe@example.com");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(order).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
