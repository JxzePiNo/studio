import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createExam } from "./exam-helpers";
import { studyDay } from "../lib/study-session";

test("study summary counts saved reads and keeps the timer while navigating and hiding", async ({ page, request }) => {
  await page.clock.install();
  await page.goto("/");
  const exam = await createExam(page, "Sessione di studio");
  const uploaded = page.waitForResponse(r => r.url().endsWith("/api/documents") && r.request().method() === "POST");
  await page.getByLabel("Carica PDF o immagini", { exact: true }).setInputFiles({ name: "Studio.pdf", mimeType: "application/pdf", buffer: await readFile("public/esempio.pdf") });
  const document = await (await uploaded).json();
  await page.getByRole("button", { name: `Apri ${document.name.replace(/\.pdf$/i, "")}`, exact: true }).click();
  const baseline = ((await (await request.get(`/api/study-sessions?day=${studyDay()}`)).json()).activity[studyDay()] || 0) as number;
  try {
    await expect(page.locator(".slide-stage canvas")).toBeVisible();
    const bar = page.getByRole("region", { name: "Riepilogo studio", exact: true });
    await expect(bar).toContainText("0 / 3");
    await page.locator(".slide-stage canvas").click();
    await page.keyboard.press("Space");
    await expect(bar.getByText("pag oggi", { exact: true }).locator("..").locator("strong")).toHaveText(String(baseline + 1));
    await expect(bar).toContainText("1 / 3");
    await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 1000));
    await bar.getByRole("button", { name: "Play", exact: true }).click();
    await page.clock.runFor(3100);
    await expect(bar.getByRole("timer")).toHaveText("00:03");
    await page.getByRole("button", { name: "Torna alla biblioteca", exact: true }).click();
    await page.clock.runFor(2100);
    await expect(bar.getByRole("timer")).toHaveText("00:05");
    await bar.getByRole("button", { name: "Pausa", exact: true }).click();
    await page.clock.runFor(5000);
    await expect(bar.getByRole("timer")).toHaveText("00:05");
    await page.getByRole("button", { name: "Nascondi riepilogo studio", exact: true }).click();
    await expect(bar).toHaveCount(0);
    await page.getByRole("button", { name: "Mostra riepilogo studio", exact: true }).click();
    await expect(bar.getByRole("timer")).toHaveText("00:05");
    await page.reload();
    await expect(bar.getByRole("timer")).toHaveText("00:05");
    await expect(bar.getByText("pag oggi", { exact: true }).locator("..").locator("strong")).toHaveText(String(baseline + 1));
    await bar.getByRole("button", { name: "Play", exact: true }).click();
    await page.clock.runFor(2100);
    await expect(bar.getByRole("timer")).toHaveText("00:07");
    await bar.getByRole("button", { name: "Pausa", exact: true }).click();
    await expect(page.getByRole("button", { name: "Sposta riepilogo studio", exact: true })).toHaveCount(0);
    const fixed = (await bar.boundingBox())!;
    await page.reload();
    await expect.poll(async () => (await bar.boundingBox())?.y).toBe(fixed.y);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(async () => {
      const bounds = (await bar.boundingBox())!;
      return bounds.x >= 0 && bounds.x + bounds.width <= 390;
    }).toBe(true);
    await bar.getByRole("button", { name: "Fine sessione", exact: true }).click();
    await expect(bar.getByRole("timer")).toHaveText("00:00");
  } finally { await request.delete(`/api/documents/${document.id}`); await request.delete(`/api/folders/${exam.id}`); }
});
