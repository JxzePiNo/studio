import { test, expect } from "@playwright/test";

test("Tony resta nello spazio riservato e le guide navigano senza modificare dati", async ({ page }) => {
  await page.goto("/");
  const tony = page.getByRole("button", { name: "Un consiglio da Tony del bar" });
  await expect(tony).toBeVisible();
  const mascot = await tony.boundingBox();
  expect(mascot!.y).toBeGreaterThan(300);
  const brand = page.getByRole("link", { name: "Studio, pagina iniziale" });
  await expect(brand).toHaveCSS("font-size", "29px");
  await page.getByRole("button", { name: "Apri menu account" }).click();
  await page.getByRole("menuitem", { name: "Aiuto e guide" }).click();
  await expect(page.getByRole("dialog", { name: "Cosa vuoi fare?" })).toBeVisible();
  await page.getByRole("button", { name: /Rivedi le sessioni/ }).click();
  await expect(page).toHaveURL(/\/sessioni/);
  await expect(page.getByRole("region", { name: "Guida interattiva" })).toContainText("1/1");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("region", { name: "Guida interattiva" })).toHaveCount(0);
  await page.getByRole("button", { name: /I tuoi esami/ }).click();
  await expect(page.getByRole("heading", { name: "I tuoi esami", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(tony).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
