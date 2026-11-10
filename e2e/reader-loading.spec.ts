import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createExam } from "./exam-helpers";

test("reader appears before the PDF arrives, with Tony and rotating barista actions", async ({ page, request }) => {
  await page.goto("/");
  const exam = await createExam(page, "Tony al bar");
  const document = await (await request.post("/api/documents", { multipart: { folderId: exam.id, file: { name: "Barista.pdf", mimeType: "application/pdf", buffer: await readFile("public/esempio.pdf") } } })).json();
  await page.reload();
  let release!: () => void;
  let started = false;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/api/documents/${document.id}/pdf`, async route => { started = true; await held; await route.continue(); });
  try {
    await page.getByRole("button", { name: "Apri Barista", exact: true }).click();
    await expect(page).toHaveURL(`/esami/${exam.id}/documenti/${document.id}`);
    await expect(page.locator(".reader-active .slide-stage")).toBeVisible();
    await expect(page.getByText("Lavando i bicchieri…", { exact: true })).toBeVisible();
    await expect.poll(() => started).toBe(true);
    await expect(page.getByText("Preparando uno spritz…", { exact: true })).toBeVisible();
    await page.screenshot({ path: "test-results/barista-loading.png" });
    release();
    await expect(page.locator(".slide-stage canvas")).toBeVisible();
    await expect(page.getByText("Tony sta aprendo il PDF.", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Torna alla biblioteca", exact: true }).click();
    // Cancelling an opening must not later reopen the PDF when its response arrives.
    await page.unroute(`**/api/documents/${document.id}/pdf`);
    let finish!: () => void;
    const waiting = new Promise<void>(resolve => { finish = resolve; });
    await page.route(`**/api/documents/${document.id}`, async route => { await waiting; await route.continue().catch(() => {}); });
    await page.getByRole("button", { name: "Apri Barista", exact: true }).click();
    await expect(page.getByText("Tony sta aprendo il PDF.", { exact: true })).toBeAttached();
    await page.goBack();
    await expect(page.locator(".materials-list")).toBeVisible();
    finish();
    await expect(page).toHaveURL(`/esami/${exam.id}`);
  } finally { release(); await request.delete(`/api/documents/${document.id}`); await request.delete(`/api/folders/${exam.id}`); }
});
