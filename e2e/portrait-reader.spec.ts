import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

for (const width of [1280, 390]) test(`toolbar navigates and completes portrait and landscape pages at ${width}px`, async ({ page, request }) => {
  await page.setViewportSize({ width, height: 844 });
  const folder = await (await request.post("/api/folders", { data: { name: `Orientamento ${Date.now()}` } })).json();
  const pdf = await PDFDocument.create(); pdf.addPage([600, 850]); pdf.addPage([850, 600]);
  const doc = await (await request.post("/api/documents", { multipart: { folderId: folder.id, file: { name: "Misto.pdf", mimeType: "application/pdf", buffer: Buffer.from(await pdf.save()) } } })).json();
  try {
    await page.goto(`/esami/${folder.id}/documenti/${doc.id}`);
    await expect(page.locator(".slide-panel")).toHaveClass(/portrait-pdf/);
    const toolbar = page.getByRole("toolbar", { name: "Comandi del PDF" });
    const complete = toolbar.getByRole("button", { name: "Completata", exact: true });
    await expect(complete).toBeVisible();
    await expect(toolbar.getByRole("spinbutton", { name: "Numero della slide" })).toHaveValue("1");
    await toolbar.getByRole("button", { name: "Adatta automaticamente il PDF" }).click();
    await expect.poll(async () => page.locator(".slide-stage canvas").evaluate(element => Math.abs(element.getBoundingClientRect().width - element.parentElement!.clientWidth))).toBeLessThan(2);
    await page.screenshot({ path: `test-results/portrait-toolbar-${width}.png` });
    await complete.click();
    await expect(page.getByRole("spinbutton", { name: "Numero della slide" })).toHaveValue("2");
    await expect(page.locator(".slide-panel")).not.toHaveClass(/portrait-pdf/);
    await expect(complete).toBeVisible();
    await expect.poll(async () => (await (await request.get(`/api/documents/${doc.id}`)).json()).slides[1]?.read).toBe(true);
  } finally { await request.delete(`/api/folders/${folder.id}`); }
});
