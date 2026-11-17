import { test, expect } from "@playwright/test";
import { createExam } from "./exam-helpers";
import { readFile } from "node:fs/promises";

test("the PDF-only flag defaults to off and remembers enabling and disabling for that file", async ({ page, request }) => {
  await page.route("**/api/status", route => route.fulfill({ json: { configured: true } }));
  await page.goto("/");
  const exam = await createExam(page, "Solo PDF");
  const uploaded = page.waitForResponse(response => response.url().endsWith("/api/documents") && response.request().method() === "POST");
  await page.getByLabel("Carica PDF o immagini", { exact: true }).setInputFiles("public/esempio.pdf");
  const doc = await (await uploaded).json();
  const anotherUpload = page.waitForResponse(response => response.url().endsWith("/api/documents") && response.request().method() === "POST");
  await page.getByLabel("Carica PDF o immagini", { exact: true }).setInputFiles({ name: "Altro.pdf", mimeType: "application/pdf", buffer: await readFile("public/esempio.pdf") });
  const other = await (await anotherUpload).json();
  try {
    await page.getByRole("button", { name: "Apri esempio", exact: true }).click();
    const flag = page.getByRole("switch", { name: "Rispondi solo con informazioni nel PDF", exact: true });
    await expect(flag).toBeVisible();
    await expect(page.locator(".chat-pdf-only label")).toHaveCSS("flex-direction", "row");
    await expect(page.locator(".chat-pdf-only label")).toHaveCSS("gap", "8px");
    await page.screenshot({ path: "test-results/pdf-switch-desktop.png" });
    await expect(flag).not.toBeChecked();
    await flag.check();
    await expect(page.getByRole("button", { name: "Tutto PDF", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Aggiungi allegati", exact: true })).toBeDisabled();
    let received = false;
    await page.route("**/api/documents/*/chat", async route => {
      const body = route.request().postDataJSON();
      expect(body.pdfOnly).toBe(true); expect(body.scope).toBe("document"); received = true;
      await route.fulfill({ json: [{ role: "user", content: body.question }, { role: "assistant", content: "Non lo so: nel PDF non trovo informazioni sufficienti per rispondere.", retrieval: [{ documentId: doc.id, documentName: "esempio.pdf", page: 2, text: "Passaggio originale recuperato per verificare le fonti." }] }] });
    });
    await page.getByRole("textbox", { name: "Domanda al tutor", exact: true }).fill("Qual è la popolazione di Marte?");
    await page.getByRole("button", { name: "Invia domanda", exact: true }).click();
    await expect.poll(() => received).toBe(true);
    await expect(page.locator(".chat-conversation .chat-message.assistant")).toContainText("Non lo so");
    await expect(page.locator(".chat-retrieval")).toContainText("Passaggio originale recuperato per verificare le fonti.");
    await expect(page.locator(".chat-retrieval")).toContainText("esempio.pdf");
    await expect(page.locator(".chat-retrieval").getByRole("button", { name: "Pagina 2", exact: true })).toBeVisible();
    await page.locator(".chat-retrieval").scrollIntoViewIfNeeded();
    await page.screenshot({ path: "test-results/pdf-retrieval.png" });
    await page.reload(); await expect(flag).toBeChecked();
    await page.goto(`/esami/${exam.id}/documenti/${other.id}`);
    await expect(flag).not.toBeChecked();
    await page.goto(`/esami/${exam.id}/documenti/${doc.id}`);
    await expect(flag).toBeChecked();
    await flag.uncheck();
    await page.reload(); await expect(flag).not.toBeChecked();
    await expect(page.getByRole("button", { name: "Aggiungi allegati", exact: true })).toBeEnabled();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Apri chat con Tony", exact: true }).click();
    await page.locator(".chat-pdf-only").scrollIntoViewIfNeeded();
    await expect(page.locator(".chat-pdf-only label")).toHaveCSS("flex-direction", "row");
    await page.screenshot({ path: "test-results/pdf-switch-mobile.png" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await request.delete(`/api/documents/${doc.id}`); await request.delete(`/api/documents/${other.id}`); await request.delete(`/api/folders/${exam.id}`); }
});
