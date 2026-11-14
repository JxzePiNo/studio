import { expect, test } from "@playwright/test";

test("exams page opens from the sidebar and mobile menu and survives reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^I tuoi esami/ }).click();
  await expect(page).toHaveURL(/\/esami$/);
  await expect(page.getByRole("heading", { name: "I tuoi esami", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Nuovo esame", exact: true })).toBeVisible();
  await expect(page.getByText("Dal tuo corso di laurea.", { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "I tuoi esami", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const menu = page.getByRole("navigation", { name: "Navigazione principale", exact: true });
  await menu.getByRole("button", { name: "Home", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await menu.getByRole("button", { name: "Esami", exact: true }).click();
  await expect(page).toHaveURL(/\/esami$/);
  await expect(menu.getByRole("button", { name: "Esami", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "I tuoi esami", exact: true })).toBeVisible();
  await page.goBack();
  await expect(menu.getByRole("button", { name: "Home", exact: true })).toHaveAttribute("aria-current", "page");
});
