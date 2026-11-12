import { expect, test } from "@playwright/test";

test("Tony stays in the main area at home and moves above Account only inside a course", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.route("**/api/folders", route => route.fulfill({ json: Array.from({ length: 2 }, (_, index) => ({ id: `course-${index}`, name: `Esame ${index + 1}`, createdAt: new Date().toISOString() })) }));
  await page.goto("/");
  const sidebarTony = page.locator('.sidebar [data-placement="sidebar"]');
  await expect(page.locator('main [data-placement="workspace"]')).toBeVisible();
  await expect(sidebarTony).toHaveCount(0);
  await page.locator(".sidebar .folder-item").first().click();
  await expect(sidebarTony).toBeVisible();
  const slot = await page.locator(".sidebar-tony-slot").boundingBox();
  const companion = await sidebarTony.locator(":scope > div").boundingBox();
  const account = await page.getByRole("button", { name: "Apri menu account", exact: true }).boundingBox();
  const lastExam = await page.locator(".sidebar .folder-item").last().boundingBox();
  expect(slot).toBeTruthy(); expect(companion).toBeTruthy();
  expect(companion!.y).toBeGreaterThan(lastExam!.y + lastExam!.height);
  expect(companion!.y + companion!.height).toBeLessThan(account!.y);
  expect(account!.y - companion!.y - companion!.height).toBeLessThan(32);
  const mascot = (await sidebarTony.getByRole("button", { name: "Un consiglio da Tony del bar", exact: true }).boundingBox())!;
  const bubble = (await sidebarTony.locator(":scope > div > div").boundingBox())!;
  expect(mascot.x - slot!.x).toBeLessThan(8);
  expect(bubble.x).toBeGreaterThan(mascot.x + mascot.width);
  await page.screenshot({ path: "test-results/tony-course-sidebar.png" });
  await page.setViewportSize({ width: 1280, height: 480 });
  await expect(page.locator('main [data-placement="workspace"]')).toBeVisible();
  await expect(sidebarTony).toHaveCount(0);
  await page.setViewportSize({ width: 1280, height: 1000 });
  await expect(sidebarTony).toBeVisible();
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(page.locator('main [data-placement="workspace"]')).toBeVisible();
  await expect(sidebarTony).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('main [data-placement="workspace"]')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("a long exam list keeps its scrollable space and the account accessible", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.route("**/api/folders", route => route.fulfill({ json: Array.from({ length: 20 }, (_, index) => ({ id: `course-${index}`, name: `Esame ${index + 1}`, createdAt: new Date().toISOString() })) }));
  await page.goto("/");
  await expect(page.locator(".sidebar .folder-item")).toHaveCount(20);
  await page.locator(".sidebar .folder-item").first().click();
  await expect(page.locator('main [data-placement="workspace"]')).toBeVisible();
  await expect(page.locator('.sidebar [data-placement="sidebar"]')).toHaveCount(0);
  await page.locator(".sidebar .folder-item").last().scrollIntoViewIfNeeded();
  await expect(page.locator(".sidebar .folder-item").last()).toBeVisible();
  await expect(page.getByRole("button", { name: "Apri menu account", exact: true })).toBeVisible();
});
