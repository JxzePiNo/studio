import { expect, test } from "@playwright/test";

for (const width of [1280, 390]) test(`invites live inside Friends and mobile navigation floats at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const navigation = width === 390 ? page.getByRole("navigation", { name: "Navigazione principale", exact: true }) : page.getByRole("navigation", { name: "Studio", exact: true });
  await expect(navigation.getByRole("button", { name: /Inviti/ })).toHaveCount(0);
  if (width === 390) {
    await expect(navigation.getByRole("button")).toHaveCount(4);
    const box = (await navigation.boundingBox())!;
    expect(box.x).toBe(16); expect(844 - box.y - box.height).toBe(16);
    await expect(navigation).toHaveCSS("border-radius", "999px");
  }
  await navigation.getByRole("button", { name: "Amici", exact: true }).click();
  await page.getByRole("tab", { name: "Inviti", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Inviti e saluti", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/amici\?tab=inviti$/);
  await expect(navigation.getByRole("button", { name: "Amici", exact: true })).toHaveAttribute("aria-current", "page");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/friends-invites-navigation-${width}.png`, fullPage: true });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("tab", { name: "Inviti", exact: true })).toHaveAttribute("data-state", "active");
  await page.goto("/inviti", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/amici\?tab=inviti$/);
  await expect(page.getByRole("heading", { name: "Inviti e saluti", exact: true })).toBeVisible();
  await navigation.getByRole("button", { name: "Amici", exact: true }).click();
  await expect(page).toHaveURL(/\/amici$/);
  await expect(page.getByRole("tab", { name: "Amici", exact: true })).toHaveAttribute("data-state", "active");
});
