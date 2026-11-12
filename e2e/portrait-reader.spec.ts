import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

for (const width of [1280, 390]) test(`portrait pages have lateral arrows and completion below back, landscape keeps its navigation at ${width}px`, async ({ page, request }) => {
  await page.setViewportSize({ width, height: 844 });
  const folder = await (await request.post("/api/folders", { data: { name: `Orientamento ${Date.now()}` } })).json();
  const pdf = await PDFDocument.create(); pdf.addPage([600, 850]); pdf.addPage([850, 600]);
  const doc = await (await request.post("/api/documents", { multipart: { folderId: folder.id, file: { name: "Misto.pdf", mimeType: "application/pdf", buffer: Buffer.from(await pdf.save()) } } })).json();
  try {
    await page.goto(`/esami/${folder.id}/documenti/${doc.id}`);
    await expect(page.locator(".slide-panel")).toHaveClass(/portrait-pdf/);
    const stage = (await page.locator(".slide-panel").boundingBox())!, prev = (await page.getByRole("button", { name: "Pagina precedente", exact: true }).boundingBox())!, next = (await page.getByRole("button", { name: "Pagina successiva", exact: true }).boundingBox())!;
    expect(prev.x).toBeLessThan(stage.x + 55); expect(next.x).toBeGreaterThan(stage.x + stage.width - 60);
    expect(Math.abs(prev.y + prev.height / 2 - stage.y - stage.height / 2)).toBeLessThan(3);
    const back = (await page.getByRole("button", { name: "Torna alla biblioteca", exact: true }).boundingBox())!;
    const complete = page.getByRole("button", { name: "Completata", exact: true });
    expect((await complete.boundingBox())!.y).toBeGreaterThan(back.y + back.height);
    const completed = (await complete.boundingBox())!;
    expect(Math.abs(completed.x + completed.width / 2 - back.x - back.width / 2)).toBeLessThan(2);
    await expect(page.locator(".slide-stage")).toHaveCSS("scrollbar-width", "none");
    await expect(page.getByText("oppure premi Spazio", { exact: true })).toBeVisible();
    await page.screenshot({ path: `test-results/portrait-side-navigation-${width}.png` });
    await complete.click();
    await expect(page.getByRole("spinbutton", { name: "Numero della slide" })).toHaveValue("2");
    await expect(page.locator(".slide-panel")).not.toHaveClass(/portrait-pdf/);
    await expect(complete).toHaveCount(0);
    await expect.poll(async () => (await (await request.get(`/api/documents/${doc.id}`)).json()).slides[1]?.read).toBe(true);
  } finally { await request.delete(`/api/folders/${folder.id}`); }
});
