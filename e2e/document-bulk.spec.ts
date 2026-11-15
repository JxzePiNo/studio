import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

for (const width of [1280, 390]) test(`multiple PDFs use one request per bulk action at ${width}px`, async ({ page, request }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width, height: 900 });
  const folder = await (await request.post("/api/folders", { data: { name: `Selezione PDF ${Date.now()}` } })).json();
  const pdf = await PDFDocument.create(); pdf.addPage([600, 850]);
  for (const name of ["Slide.pdf", "Libro.pdf", "Esercizi.pdf"]) await request.post("/api/documents", { multipart: { folderId: folder.id, file: { name, mimeType: "application/pdf", buffer: Buffer.from(await pdf.save()) } } });
  const bulkRequests: { ids: string[]; action: string }[] = [];
  let singleMutations = 0;
  page.on("request", request => {
    if (request.url().endsWith("/api/documents/bulk") && request.method() === "POST") bulkRequests.push(request.postDataJSON());
    if (/\/api\/documents\/[^/]+(?:\/study-settings)?$/.test(request.url()) && ["PATCH", "DELETE"].includes(request.method())) singleMutations++;
  });
  try {
    await page.goto(`/esami/${folder.id}`);
    await page.getByRole("checkbox", { name: "Seleziona Slide.pdf", exact: true }).check();
    await page.getByRole("checkbox", { name: "Seleziona Libro.pdf", exact: true }).check();
    await page.getByRole("button", { name: "Escludi dalle statistiche", exact: true }).click();
    await expect(page.locator('[data-excluded-from-study="true"]')).toHaveCount(2);
    expect(bulkRequests).toHaveLength(1); expect(bulkRequests[0].ids).toHaveLength(2);
    expect(singleMutations).toBe(0);
    await page.getByRole("button", { name: "Includi nelle statistiche", exact: true }).click();
    await expect(page.locator('[data-excluded-from-study="true"]')).toHaveCount(0);
    expect(bulkRequests).toHaveLength(2);
    await page.getByRole("button", { name: "Elimina selezionati", exact: true }).click();
    const confirmation = page.getByRole("dialog", { name: "Elimina PDF selezionati", exact: true });
    await expect(confirmation).toContainText("Slide.pdf"); await expect(confirmation).toContainText("Libro.pdf");
    await confirmation.getByRole("button", { name: "Annulla", exact: true }).click();
    expect(bulkRequests).toHaveLength(2);
    await page.getByRole("button", { name: "Elimina selezionati", exact: true }).click();
    await confirmation.getByRole("button", { name: "Elimina PDF selezionati", exact: true }).click();
    await expect(page.locator(".material-row")).toHaveCount(1);
    expect(bulkRequests).toHaveLength(3); expect(bulkRequests[2].action).toBe("delete"); expect(singleMutations).toBe(0);
    await expect(page.getByRole("button", { name: "Apri Esercizi", exact: true })).toBeVisible();
    await page.reload(); await expect(page.locator(".material-row")).toHaveCount(1);
    await page.getByRole("checkbox", { name: "Seleziona tutti i PDF visibili", exact: true }).check();
    await expect(page.getByRole("checkbox", { name: "Seleziona Esercizi.pdf", exact: true })).toBeChecked();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await request.delete(`/api/folders/${folder.id}`); }
});
