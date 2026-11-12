import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createExam } from "./exam-helpers";

test("daily counter updates before a queued save and the annual map follows read toggles", async ({ page, request }) => {
  await page.goto("/");
  const exam = await createExam(page, "Attività annuale");
  const uploaded = page.waitForResponse(r => r.url().endsWith("/api/documents") && r.request().method() === "POST");
  await page.getByLabel("Carica PDF o immagini", { exact: true }).setInputFiles({ name: "Attivita.pdf", mimeType: "application/pdf", buffer: await readFile("public/esempio.pdf") });
  const document = await (await uploaded).json();
  await page.getByRole("button", { name: `Apri ${document.name.replace(/\.pdf$/i, "")}`, exact: true }).click();
  let release!: () => void;
  let saveStarted = false;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/api/documents/${document.id}`, async route => {
    if (route.request().method() !== "PATCH") return route.fallback();
    saveStarted = true; await waiting; await route.continue();
  });
  const today = await page.evaluate(() => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; });
  const bar = page.getByRole("region", { name: "Riepilogo studio", exact: true });
  const heatmap = page.getByRole("region", { name: "Attività di lettura annuale", exact: true });
  const historyBefore = await (await request.get(`/api/study-sessions?day=${today}`)).json();
  const expectedCount = (historyBefore.activity[today] || 0) + 1;
  try {
    await expect(page.locator(".slide-stage canvas")).toBeVisible();
    await page.getByRole("button", { name: "Mostra pannello inferiore" }).click();
    await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
    await page.keyboard.press("Space");
    await expect.poll(() => saveStarted).toBe(true);
    await expect(bar.getByText("pag oggi", { exact: true }).locator("..").locator("strong")).toHaveText(String(expectedCount));
    await page.getByRole("button", { name: "Torna alla biblioteca", exact: true }).click();
    await page.getByRole("button", { name: "Torna alla home", exact: true }).click();
    await expect(heatmap.locator(`[data-date="${today}"]`)).toHaveAccessibleName(new RegExp(`: ${expectedCount} pagin`));
    await expect(heatmap.locator("button[data-date]")).toHaveCount(365);
    release();
    await expect.poll(async () => (await (await request.get(`/api/documents/${document.id}`)).json()).slides[1]?.read).toBe(true);
    await page.reload();
    await expect(heatmap.locator(`[data-date="${today}"]`)).toHaveAccessibleName(new RegExp(`: ${expectedCount} pagin`));
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: "test-results/reading-activity-mobile.png" });
  } finally { release(); await request.delete(`/api/documents/${document.id}`); await request.delete(`/api/folders/${exam.id}`); }
});
