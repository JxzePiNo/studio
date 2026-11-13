import { expect, test } from "@playwright/test";

for (const width of [1280, 390]) test(`theme submenu follows system and adaptive hours at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.clock.install({ time: new Date("2026-11-13T19:59:00+01:00") });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const html = page.locator("html");
  const open = async () => {
    await page.getByRole("button", { name: width === 390 ? "Account" : "Apri menu account", exact: true }).click();
    const trigger = page.getByRole("menuitem", { name: "Modalità notte", exact: true });
    if (width === 390) await trigger.click(); else await trigger.hover();
    await expect(page.getByRole("menuitemradio", { name: "Sistema", exact: true })).toBeVisible();
  };
  await open();
  await page.getByRole("menuitemradio", { name: "Sistema", exact: true }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(html).toHaveAttribute("data-theme", "light");
  await open();
  await page.getByRole("menuitemradio", { name: "Scuro", exact: true }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await open();
  await page.getByRole("menuitemradio", { name: "Chiaro", exact: true }).click();
  await expect(html).toHaveAttribute("data-theme", "light");
  await open();
  await page.getByRole("menuitemradio", { name: /Adattivo/ }).click();
  await expect(html).toHaveAttribute("data-theme", "light");
  await page.clock.fastForward(60_000);
  await expect(html).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await page.clock.fastForward(12 * 60 * 60_000);
  await expect(html).toHaveAttribute("data-theme", "light");
  expect(await page.evaluate(() => localStorage.getItem("studio-theme"))).toBe("adaptive");
});
