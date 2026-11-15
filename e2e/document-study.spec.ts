import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

for (const width of [1280, 390]) test(`reference materials are excluded from the plan and can be included again at ${width}px`, async ({ page, request }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width, height: 900 });
  const folder = await (await request.post("/api/folders", { data: { name: `Piano materiali ${Date.now()}`, examDate: "2099-12-01" } })).json();
  async function upload(name: string, count: number) {
    const pdf = await PDFDocument.create(); for (let index = 0; index < count; index++) pdf.addPage([600, 850]);
    return (await request.post("/api/documents", { multipart: { folderId: folder.id, file: { name, mimeType: "application/pdf", buffer: Buffer.from(await pdf.save()) } } })).json();
  }
  await upload("Slide.pdf", 6);
  const book = await upload("Libro.pdf", 12);
  const bookRow = page.locator(`[data-document-id="${book.id}"]`);
  try {
    await page.goto(`/esami/${folder.id}`);
    await bookRow.getByRole("button", { name: "Azioni Libro", exact: true }).click();
    await page.getByRole("menuitem", { name: "Escludi dalle statistiche", exact: true }).click();
    await expect(bookRow).toContainText("Solo consultazione");
    await expect(bookRow.getByRole("button", { name: "Apri Libro", exact: true })).toBeEnabled();
    const navigation = page.getByRole("navigation", { name: width === 390 ? "Navigazione principale" : "Studio", exact: true });
    await navigation.getByRole("button", { name: "Calendario", exact: true }).click();
    const course = page.getByRole("article").filter({ has: page.getByRole("heading", { name: new RegExp(`Piano Materiali`) }) });
    const ownCourse = course.filter({ hasText: folder.name.match(/\d+$/)![0] });
    await expect(ownCourse).toContainText("6 pagine da studiare su 6");
    await page.reload();
    await expect(ownCourse).toContainText("6 pagine da studiare su 6");
    expect((await (await request.get(`/api/documents/${book.id}`)).json()).excludedFromStudy).toBe(true);
    expect((await request.get(`/api/documents/${book.id}/pdf`)).status()).toBe(200);
    await page.goto(`/esami/${folder.id}`);
    await bookRow.getByRole("button", { name: "Azioni Libro", exact: true }).click();
    await page.getByRole("menuitem", { name: "Includi nelle statistiche", exact: true }).click();
    await expect(bookRow).not.toContainText("Solo consultazione");
    await navigation.getByRole("button", { name: "Calendario", exact: true }).click();
    await expect(ownCourse).toContainText("18 pagine da studiare su 18");
  } finally { await request.delete(`/api/folders/${folder.id}`); }
});
