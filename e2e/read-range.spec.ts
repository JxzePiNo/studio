import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { calendarDate, createExam } from "./exam-helpers";

test("PDF context menu imports a historical page range once and refreshes reading progress", async ({ page, request }) => {
  await page.goto("/");
  const exam = await createExam(page, "Lettura pregressa");
  const pdf = await PDFDocument.create();
  for (let index = 0; index < 4; index++) pdf.addPage();
  const uploaded = page.waitForResponse(response => response.url().endsWith("/api/documents") && response.request().method() === "POST");
  await page.getByLabel("Carica PDF o immagini", { exact: true }).setInputFiles({ name: "Lettura pregressa.pdf", mimeType: "application/pdf", buffer: Buffer.from(await pdf.save()) });
  const document = await (await uploaded).json();
  await page.getByRole("button", { name: `Apri ${document.name.replace(/\.pdf$/i, "")}`, exact: true }).click();
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  const before = new Date(); before.setDate(before.getDate() - 2);
  const startDate = calendarDate(before); const endDate = calendarDate(yesterday);
  const historyBefore = await (await request.get("/api/study-sessions")).json();
  try {
    await page.getByRole("button", { name: "Torna alla biblioteca", exact: true }).click();
    const row = page.locator(`[data-document-id="${document.id}"]`);
    await row.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Segna pagine lette", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Segna pagine lette", exact: true });
    await dialog.getByLabel("Dalla pagina", { exact: true }).fill("2");
    await dialog.getByLabel("Alla pagina", { exact: true }).fill("3");
    await dialog.getByRole("checkbox").check();
    await dialog.getByLabel("Dal giorno", { exact: true }).fill(startDate);
    await dialog.getByLabel("Al giorno", { exact: true }).fill(endDate);
    await dialog.getByRole("button", { name: "Segna come lette", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(row.locator(".material-progress-count")).toHaveText("2/4");
    const saved = await (await request.get(`/api/documents/${document.id}`)).json();
    expect(saved.slides[2].read).toBe(true);
    expect(saved.slides[3].read).toBe(true);
    expect(saved.slides[1]?.read).not.toBe(true);
    const history = await (await request.get("/api/study-sessions")).json();
    expect(history.activity[startDate]).toBe((historyBefore.activity[startDate] || 0) + 1);
    expect(history.activity[endDate]).toBe((historyBefore.activity[endDate] || 0) + 1);
    const repeated = await request.post(`/api/documents/${document.id}/read-range`, { data: { from: 2, to: 3, startDate, endDate } });
    expect(repeated.ok()).toBe(true);
    expect((await repeated.json()).history.activity).toEqual(history.activity);
    await page.reload();
    await expect(page.locator(`[data-document-id="${document.id}"] .material-progress-count`)).toHaveText("2/4");
  } finally { await request.delete(`/api/documents/${document.id}`); await request.delete(`/api/folders/${exam.id}`); }
});
