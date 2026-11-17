import { test, expect } from "@playwright/test";
import { defaultPlatform } from "../lib/platform-config";

test("admin has a searchable current-month user cost screen with refresh and partial coverage", async ({ page, request }) => {
  expect((await request.get("/api/admin/monthly-costs")).status()).toBe(403);
  await page.route("**/api/admin", route => route.fulfill({ json: { users: [], cursor: null, config: defaultPlatform, audit: [], generatedAt: "2026-11-17T12:00:00Z" } }));
  let reads = 0;
  await page.route("**/api/admin/monthly-costs", route => {
    reads++;
    return route.fulfill({ json: { month: "2026-11", start: "2026-10-31T23:00:00Z", end: "2026-11-17T12:00:00Z", timeZone: "Europe/Rome", usd: 14.9, calls: 15, incompleteUsers: 2, users: [
      { uid: "a", name: "Alice", email: "alice@example.com", calls: 10, tokens: 5000, usd: 2.5, complete: true, unpricedCalls: 0 },
      { uid: "b", name: "Bob", email: "bob@example.com", calls: 3, tokens: 1000, usd: 0.4, complete: false, unpricedCalls: 1 },
      { uid: "c", name: "Oltre soglia", email: "over@example.com", calls: 1, tokens: 1000, usd: 12, complete: true, unpricedCalls: 0 },
      { uid: "d", name: "Non misurato", email: "unknown@example.com", calls: 1, tokens: 0, usd: null, complete: false, unpricedCalls: 1 },
    ] } });
  });
  await page.goto("/admin");
  await page.getByRole("button", { name: "Costi mensili utenti", exact: true }).click();
  const screen = page.getByRole("region", { name: "Costi utenti del mese corrente" });
  await expect(screen).toContainText("novembre 2026");
  await expect(screen).toContainText(/dal 0?1\/11\/2026/);
  await expect(screen).toContainText("Almeno 14,90");
  await expect(screen.getByRole("row").filter({ hasText: "alice@example.com" })).toContainText("2,50");
  await expect(screen.getByRole("columnheader", { name: "Costo del mese (EUR)" })).toBeVisible();
  await expect(screen.getByRole("progressbar", { name: "Costo mensile di Alice", exact: true })).toHaveAttribute("aria-valuetext", /25% di 9,99/);
  await expect(screen.getByRole("progressbar", { name: "Costo mensile di Oltre soglia", exact: true })).toHaveAttribute("aria-valuenow", "100");
  await expect(screen.getByRole("row").filter({ hasText: "over@example.com" })).toContainText("Superato di 2,01");
  await expect(screen.getByRole("progressbar", { name: "Costo mensile di Non misurato", exact: true })).not.toHaveAttribute("aria-valuenow");
  await expect(screen).toContainText("1 USD = 1 EUR");
  await expect(screen.getByRole("table")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await expect(screen.getByRole("table")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(screen.getByRole("row").filter({ hasText: "bob@example.com" })).toContainText("1 richieste con costo incompleto");
  await screen.getByLabel("Cerca nei costi mensili").fill("bob@");
  await expect(screen.locator("tbody tr")).toHaveCount(1);
  await screen.getByRole("button", { name: "Aggiorna costi mensili" }).click();
  await expect.poll(() => reads).toBe(2);
  await expect(screen.locator("tbody tr")).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
