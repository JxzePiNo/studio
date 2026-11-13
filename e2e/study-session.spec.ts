import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createExam } from "./exam-helpers";
import { studyDay } from "../lib/study-session";

test("PDF study saves automatically and clean view restores the controls", async ({ page, request }) => {
  await page.clock.install();
  await page.goto("/");
  const exam = await createExam(page, "Lettura automatica");
  const uploaded = page.waitForResponse(r => r.url().endsWith("/api/documents") && r.request().method() === "POST");
  await page.getByLabel("Carica PDF o immagini", { exact: true }).setInputFiles({ name: "Automatico.pdf", mimeType: "application/pdf", buffer: await readFile("public/esempio.pdf") });
  const document = await (await uploaded).json();
  const saved: { durationMs: number }[] = [];
  page.on("request", request => {
    if (request.url().includes("/api/study-sessions") && request.method() === "POST") {
      const action = request.postDataJSON();
      if (action.type === "session") saved.push(action.session);
    }
  });
  try {
    await page.getByRole("button", { name: "Apri Automatico", exact: true }).click();
    await expect(page.locator(".slide-stage canvas")).toBeVisible();
    const toolbar = page.getByRole("toolbar", { name: "Comandi del PDF" });
    await expect(toolbar).toContainText("Automatico");
    await expect(toolbar.getByRole("spinbutton", { name: "Numero della slide" })).toHaveValue("1");
    await toolbar.getByRole("button", { name: "Aumenta zoom", exact: true }).click();
    await expect(toolbar.getByRole("button", { name: "Zoom 110%, ripristina al 100%" })).toBeVisible();
    await toolbar.getByRole("button", { name: "Adatta automaticamente il PDF", exact: true }).click();
    await expect(toolbar.getByRole("button", { name: "Zoom 100%, ripristina al 100%" })).toBeVisible();
    await toolbar.getByRole("button", { name: "Pagina successiva", exact: true }).click();
    await expect(toolbar.getByRole("spinbutton", { name: "Numero della slide" })).toHaveValue("2");
    await toolbar.getByRole("button", { name: "Impostazioni della lettura", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Chiudi impostazioni", exact: true }).click();
    await toolbar.getByRole("button", { name: "Ingrandisci PDF", exact: true }).click();
    await expect(page.getByRole("complementary", { name: "Tutor della slide" })).toBeHidden();
    await expect(toolbar).toBeVisible();
    await toolbar.getByRole("button", { name: "Mostra PDF e chat", exact: true }).click();
    await expect(page.getByRole("complementary", { name: "Tutor della slide" })).toBeVisible();
    await toolbar.getByRole("button", { name: "Pulisci schermata", exact: true }).click();
    await expect(page.locator(".slide-stage canvas")).toBeVisible();
    await expect(page.getByRole("button", { name: "Torna alla biblioteca", exact: true })).toBeHidden();
    await expect(page.getByRole("region", { name: "Riepilogo studio", exact: true })).toHaveCount(0);
    await expect(page.getByRole("separator", { name: "Ridimensiona chat" })).toBeHidden();
    await expect(page.getByRole("complementary", { name: "Tutor della slide" })).toBeVisible();
    await page.clock.runFor(61000);
    await expect.poll(() => saved.length).toBeGreaterThan(0);
    expect(saved[0].durationMs).toBeGreaterThanOrEqual(60000);
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect.poll(() => saved.length).toBeGreaterThan(1);
    const hiddenCount = saved.length;
    await page.clock.runFor(61000);
    expect(saved).toHaveLength(hiddenCount);
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator(".slide-stage canvas")).toBeVisible();
    const toggle = await page.getByRole("button", { name: "Mostra tutti i controlli", exact: true }).boundingBox();
    expect(toggle!.width).toBe(toggle!.height);
    expect(toggle!.x + toggle!.width).toBeLessThanOrEqual(390);
    await page.clock.runFor(2100);
    await page.getByRole("button", { name: "Mostra tutti i controlli", exact: true }).click();
    await expect(page.getByRole("button", { name: "Torna alla biblioteca", exact: true })).toBeVisible();
    const beforeClose = saved.length;
    await page.getByRole("button", { name: "Torna alla biblioteca", exact: true }).click();
    await expect.poll(() => saved.length).toBeGreaterThan(beforeClose);
    const count = saved.length;
    await page.clock.runFor(61000);
    expect(saved).toHaveLength(count);
  } finally { await request.delete(`/api/documents/${document.id}`); await request.delete(`/api/folders/${exam.id}`); }
});

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
