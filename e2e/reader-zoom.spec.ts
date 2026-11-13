import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

for (const width of [1280, 390]) test(`zoom persists and fits portrait pages to width at ${width}px`, async ({ page, request }) => {
  page.setDefaultTimeout(5000);
  await page.setViewportSize({ width, height: 844 });
  const folder = await (await request.post("/api/folders", { data: { name: `Zoom ${Date.now()}` } })).json();
  const pdf = await PDFDocument.create(); pdf.addPage([600, 850]); pdf.addPage([600, 1000]);
  const doc = await (await request.post("/api/documents", { multipart: { folderId: folder.id, file: { name: "Zoom.pdf", mimeType: "application/pdf", buffer: Buffer.from(await pdf.save()) } } })).json();
  try {
    await page.goto(`/esami/${folder.id}/documenti/${doc.id}`, { waitUntil: "domcontentloaded" });
    const canvas = page.locator(".slide-stage canvas");
    await expect(canvas).toBeVisible();
    await page.getByRole("button", { name: "Aumenta zoom", exact: true }).click();
    await expect(page.getByRole("button", { name: "Zoom 110%, ripristina al 100%", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Pagina successiva", exact: true }).click();
    await expect(page.getByRole("spinbutton", { name: "Numero della slide" })).toHaveValue("2");
    await expect(page.getByRole("button", { name: "Zoom 110%, ripristina al 100%", exact: true })).toBeVisible();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "Zoom 110%, ripristina al 100%", exact: true })).toBeVisible();
    const fit = page.getByRole("button", { name: "Adatta automaticamente il PDF", exact: true });
    await fit.click();
    await expect(fit).toHaveAttribute("aria-pressed", "true");
    await expect.poll(async () => canvas.evaluate(element => Math.abs(element.getBoundingClientRect().width - element.parentElement!.clientWidth))).toBeLessThan(2);
    for (let step = 0; step < 10; step++) await page.getByRole("button", { name: "Aumenta zoom", exact: true }).click();
    await expect(page.getByRole("button", { name: "Zoom 200%, ripristina al 100%", exact: true })).toBeVisible();
    const stage = page.locator(".slide-stage");
    const number = page.getByRole("spinbutton", { name: "Numero della slide", exact: true });
    await page.getByRole("button", { name: "Pagina precedente", exact: true }).click();
    await expect(number).toHaveValue("1");
    await expect(canvas).toBeVisible();
    await expect.poll(() => stage.evaluate(element => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThan(2);
    expect(await stage.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await stage.dispatchEvent("wheel", { deltaY: 160 });
    await expect(number).toHaveValue("2");
    await expect(canvas).toBeVisible();
    await expect.poll(() => stage.evaluate(element => element.scrollTop)).toBe(0);
    // The wheel page-turn guard deliberately prevents immediate double turns.
    await page.waitForTimeout(650);
    await stage.dispatchEvent("wheel", { deltaY: -160 });
    await expect(number).toHaveValue("1");
    await expect(canvas).toBeVisible();
    await expect.poll(() => stage.evaluate(element => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThan(2);
    await fit.click();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(fit).toHaveAttribute("aria-pressed", "true");
    await expect(canvas).toBeVisible();
    await page.screenshot({ path: `test-results/reader-zoom-${width}.png` });
  } finally { await request.delete(`/api/folders/${folder.id}`); }
});
