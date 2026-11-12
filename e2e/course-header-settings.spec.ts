import { expect, test } from "@playwright/test";
import { formatCourseName } from "../lib/course-name";

for (const width of [1280, 390]) test(`course header opens the home settings modal and saves in place at ${width}px`, async ({ page, request }) => {
  await page.setViewportSize({ width, height: 844 });
  const name = `Impostazioni corso ${Date.now()}`;
  const folder = await (await request.post("/api/folders", { data: { name } })).json();
  let releaseFolders!: () => void;
  const loadingFolders = new Promise<void>(resolve => { releaseFolders = resolve; });
  await page.route("**/api/folders", async route => { if (route.request().method() === "GET") await loadingFolders; await route.continue(); });
  try {
    await page.goto(`/esami/${folder.id}`);
    const button = page.getByRole("button", { name: "Impostazioni del corso", exact: true });
    await expect(button).toBeVisible();
    const header = page.locator(".course-header");
    const copyBox = (await header.locator(".course-header-copy").boundingBox())!;
    const buttonBox = (await button.boundingBox())!;
    expect(buttonBox.x).toBeGreaterThanOrEqual(copyBox.x + copyBox.width);
    await button.click();
    releaseFolders();
    const dialog = page.getByRole("dialog", { name: `Impostazioni ${formatCourseName(name)}`, exact: true });
    await expect(dialog.getByLabel("Nome esame", { exact: true })).toHaveValue(name);
    await expect(dialog.getByRole("button", { name: "Archivia esame", exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Elimina esame", exact: true })).toBeVisible();
    await dialog.getByLabel("Nome esame", { exact: true }).fill(`${name} aggiornato`);
    await dialog.getByRole("button", { name: "Salva impostazioni", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/esami/${folder.id}$`));
    await expect(header.getByRole("heading", { level: 1 })).toHaveText(formatCourseName(`${name} aggiornato`));
    await button.click();
    const updated = page.getByRole("dialog", { name: `Impostazioni ${formatCourseName(`${name} aggiornato`)}`, exact: true });
    await updated.getByRole("button", { name: "Elimina esame", exact: true }).click();
    await updated.getByRole("button", { name: "Conferma eliminazione", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(updated).toHaveCount(0);
  } finally { releaseFolders(); await request.delete(`/api/folders/${folder.id}`); }
});
