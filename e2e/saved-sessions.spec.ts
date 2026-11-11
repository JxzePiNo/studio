import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createExam } from "./exam-helpers";
import { studyDay } from "../lib/study-session";

test("timer sessions persist with PDF statistics and open from the annual activity", async ({ page, request }) => {
  await page.clock.install();
  await page.goto("/");
  const exam = await createExam(page, "Statistiche salvate");
  const filename = `Sessione ${exam.id}.pdf`;
  const uploaded = page.waitForResponse(r => r.url().endsWith("/api/documents") && r.request().method() === "POST");
  await page.getByLabel("Carica PDF o immagini", { exact: true }).setInputFiles({ name: filename, mimeType: "application/pdf", buffer: await readFile("public/esempio.pdf") });
  const document = await (await uploaded).json();
  await page.getByRole("button", { name: `Apri ${document.name.replace(/\.pdf$/i, "")}`, exact: true }).click();
  try {
    await expect(page.locator(".slide-stage canvas")).toBeVisible();
    await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 1000));
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.getByRole("button", { name: "Mostra pannello inferiore", exact: true }).click();
    await page.getByRole("button", { name: "Da leggere", exact: true }).click();
    await page.clock.runFor(5200);
    await page.getByRole("button", { name: "Fine sessione", exact: true }).click();
    await expect.poll(async () => {
      const history = await (await request.get("/api/study-sessions")).json();
      return history.sessions.find((session: { documents: { id: string }[] }) => session.documents.some(item => item.id === document.id))?.pagesRead;
    }).toBe(1);
    await page.getByRole("button", { name: "Torna alla biblioteca", exact: true }).click();
    await page.getByRole("button", { name: "Sessioni di studio", exact: true }).click();
    await expect(page).toHaveURL("/sessioni");
    await expect(page.getByRole("heading", { name: "Le tue sessioni", exact: true })).toBeVisible();
    await expect(page.getByText(filename, { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Studio, pagina iniziale", exact: true }).click();
    await page.getByRole("region", { name: "Attività di lettura annuale", exact: true }).locator(`[data-date="${studyDay()}"]`).click();
    await expect(page).toHaveURL(`/sessioni?giorno=${studyDay()}`);
    await expect(page.getByText(filename, { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText(filename, { exact: true })).toBeVisible();
    await page.screenshot({ path: "test-results/saved-sessions.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: "test-results/saved-sessions-mobile.png" });
  } finally { await request.delete(`/api/documents/${document.id}`); await request.delete(`/api/folders/${exam.id}`); }
});
