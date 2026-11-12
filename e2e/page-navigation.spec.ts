import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`current page number supports direct jumps, range validation and Escape at ${viewport.width}px`, async ({ page, request }) => {
    await page.setViewportSize(viewport);
    const folder = await (await request.post("/api/folders", { data: { name: `Navigazione ${Date.now()}` } })).json();
    const document = await (await request.post("/api/documents", { multipart: { folderId: folder.id, file: { name: "Pagine.pdf", mimeType: "application/pdf", buffer: await readFile("public/esempio.pdf") } } })).json();
    try {
      await page.goto(`/esami/${folder.id}/documenti/${document.id}`);
      await expect(page.getByRole("img", { name: "Slide 1", exact: true })).toBeVisible({ timeout: 20000 });
      const number = page.getByRole("spinbutton", { name: "Numero della slide", exact: true });
      await number.click(); await number.fill("3"); await number.press("Enter");
      await expect(page.getByRole("img", { name: "Slide 3", exact: true })).toBeVisible();
      await number.fill("2"); await number.press("Tab");
      await expect(page.getByRole("img", { name: "Slide 2", exact: true })).toBeVisible();
      await number.fill("4"); await number.press("Enter");
      await expect(page.getByRole("alert").filter({ hasText: "Inserisci una pagina da 1 a 3." })).toBeVisible();
      await expect(number).toHaveValue("2");
      await number.fill("1"); await number.press("Escape");
      await expect(number).toHaveValue("2");
      await expect(page.getByRole("img", { name: "Slide 2", exact: true })).toBeVisible();
      await number.fill(""); await number.press("Enter");
      await expect(number).toHaveValue("2");
      await number.fill("1"); await number.press("Enter");
      await expect(page.getByRole("img", { name: "Slide 1", exact: true })).toBeVisible();
      const stage = (await page.locator(".slide-stage").boundingBox())!;
      const canvas = (await page.locator(".slide-stage canvas").boundingBox())!;
      expect(Math.abs(canvas.y + canvas.height / 2 - stage.y - stage.height / 2)).toBeLessThan(8);
      if (viewport.width < 700) await page.getByRole("button", { name: "Apri chat con Tony", exact: true }).click();
      await page.getByRole("button", { name: "Impostazioni della lettura", exact: true }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      // Check the actual painted layer at each arrow, even outside the dialog box.
      for (const selector of [".reader-previous", ".reader-next"]) {
        const box = (await page.locator(selector).boundingBox())!;
        expect(await page.evaluate(({ x, y }) => {
          const top = document.elementFromPoint(x, y);
          return !!top?.closest('[role="dialog"], .plan-overlay');
        }, { x: box.x + box.width / 2, y: box.y + box.height / 2 })).toBe(true);
      }
    } finally { await request.delete(`/api/folders/${folder.id}`); }
  });
}
