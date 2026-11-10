import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createExam } from "./exam-helpers";

test("leaving the reader does not wait for pending saves or library refresh", async ({ page, request }) => {
  await page.goto("/");
  const exam = await createExam(page, "Uscita immediata");
  const uploaded = page.waitForResponse(r => r.url().endsWith("/api/documents") && r.request().method() === "POST");
  await page.getByLabel("Carica un PDF", { exact: true }).setInputFiles({ name: "Lettura.pdf", mimeType: "application/pdf", buffer: await readFile("public/esempio.pdf") });
  const document = await (await uploaded).json();
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  let saveStarted = false;
  await page.route(`**/api/documents/${document.id}`, async route => {
    if (route.request().method() !== "PATCH") return route.fallback();
    saveStarted = true;
    await waiting;
    await route.continue();
  });
  try {
    await expect(page.locator(".slide-stage canvas")).toBeVisible();
    await page.getByRole("button", { name: "Mostra pannello inferiore" }).click();
    await page.getByRole("button", { name: "Da leggere", exact: true }).click();
    await expect.poll(() => saveStarted).toBe(true);
    await page.getByRole("button", { name: "Torna alla biblioteca", exact: true }).click();
    // The response remains held: navigation must succeed before it is released.
    await expect(page.locator(".materials-list")).toBeVisible();
    await expect(page).toHaveURL(`/esami/${exam.id}`);
    await expect(page.getByRole("button", { name: "Apri Lettura", exact: true })).toBeEnabled();
    release();
    await expect.poll(async () => (await (await request.get(`/api/documents/${document.id}`)).json()).slides[1]?.read).toBe(true);
  } finally { release(); await request.delete(`/api/documents/${document.id}`); await request.delete(`/api/folders/${exam.id}`); }
});
