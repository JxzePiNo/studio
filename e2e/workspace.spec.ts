import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { StudyDocument } from "../lib/types";
import { createExam } from "./exam-helpers";
import { formatCourseName } from "../lib/course-name";

test("PDF, note persistenti, navigazione e lettura con chat responsive", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "I tuoi esami", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/welcome.png", fullPage: true });
  const exam = await createExam(page);
  const upload = page.waitForResponse(r => r.url().endsWith("/api/documents") && r.request().method() === "POST");
  await page.getByLabel("Carica un PDF", { exact: true }).setInputFiles({ name: "Introduzione al machine learning.pdf", mimeType: "application/pdf", buffer: await readFile("public/esempio.pdf") });
  const response = await upload;
  expect(response.status()).toBe(201);
  const doc = await response.json() as StudyDocument;
  await page.getByRole("button", { name: `Apri ${doc.name.replace(/\.pdf$/i, "")}`, exact: true }).click();
  try {
    await expect(page.getByRole("heading", { name: "Introduzione al machine learning" })).toBeVisible();
    await expect(page.locator(".sidebar")).toHaveCount(0);
    const back = page.getByRole("button", { name: "Torna alla biblioteca" });
    await expect(back).toHaveCSS("border-radius", "12px");
    expect(await back.evaluate(el => el.getBoundingClientRect().left)).toBeLessThan(60);
    await expect(page.locator("body")).toHaveCSS("font-family", /Bricolage Grotesque/);
    await expect(page.locator(".slide-stage canvas")).toBeVisible();
    await expect(page.locator(".document-header, .panel-toolbar")).toHaveCount(0);
    await expect(page.getByRole("tablist")).toHaveCount(0);
    await expect(page.getByRole("combobox")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Esporta appunti", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Elimina documento", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Tutto PDF", exact: true })).toHaveAttribute("aria-pressed", "false");
    const composer = await page.locator(".chat-pane form").boundingBox();
    const chatPanel = await page.locator(".explanation-panel").boundingBox();
    expect(composer).not.toBeNull();
    expect(chatPanel).not.toBeNull();
    expect(Math.abs(chatPanel!.y + chatPanel!.height - composer!.y - composer!.height)).toBeLessThanOrEqual(32);
    await expect(page.getByRole("button", { name: "Mostra pannello inferiore" })).toBeVisible();
    await expect(page.getByRole("separator", { name: "Ridimensiona pannello inferiore" })).toHaveAttribute("aria-valuenow", "32");
    await page.getByRole("button", { name: "Mostra pannello inferiore" }).click();
    const stage = page.locator(".slide-stage");
    const expandedHeight = (await stage.boundingBox())!.height;
    expect((await stage.boundingBox())!.y).toBe(0);
    await page.getByRole("button", { name: "Abbassa pannello inferiore" }).click();
    await expect(page.getByRole("button", { name: "Mostra pannello inferiore" })).toBeVisible();
    expect((await stage.boundingBox())!.height).toBeGreaterThan(expandedHeight + 100);
    await page.getByRole("button", { name: "Mostra pannello inferiore" }).click();
    const grip = page.getByRole("separator", { name: "Ridimensiona pannello inferiore" });
    const position = (await grip.boundingBox())!;
    await page.mouse.move(position.x + position.width / 2, position.y + position.height / 2);
    await page.mouse.down();
    await page.mouse.move(position.x + position.width / 2, position.y + position.height / 2 + 50);
    await page.mouse.up();
    await expect(grip).toHaveAttribute("aria-valuenow", "120");
    await grip.focus();
    await page.keyboard.press("Home");
    await expect(page.getByRole("button", { name: "Mostra pannello inferiore" })).toBeVisible();
    await page.getByRole("button", { name: "Mostra pannello inferiore" }).click();
    await expect(page.getByRole("button", { name: "Analizza questa pagina", exact: true })).toBeDisabled();
    const noKey = await request.post(`/api/documents/${doc.id}/analyze`, { data: { page: 1 } });
    expect(noKey.status()).toBe(503);
    await page.getByRole("button", { name: "Impostazioni della lettura", exact: true }).click();
    const settings = page.getByRole("dialog", { name: "Impostazioni della lettura", exact: true });
    await settings.getByRole("textbox", { name: "Appunti della slide 1" }).fill("Un modello deve generalizzare, non memorizzare.");
    await page.keyboard.press("Escape");
    await expect(settings).toHaveCount(0);
    await page.getByRole("button", { name: "Slide successiva", exact: true }).click();
    await expect.poll(async () => (await (await request.get(`/api/documents/${doc.id}`)).json()).currentPage).toBe(2);
    await expect.poll(async () => (await (await request.get(`/api/documents/${doc.id}`)).json()).slides[1]?.notes).toContain("generalizzare");
    await page.reload();
    await page.getByRole("button", { name: "Mostra pannello inferiore" }).click();
    await expect(page.getByRole("spinbutton", { name: "Numero della slide" })).toHaveValue("2");
    await page.getByRole("button", { name: "Slide precedente", exact: true }).click();
    await page.getByRole("button", { name: "Impostazioni della lettura", exact: true }).click();
    await expect(settings.getByRole("textbox", { name: "Appunti della slide 1" })).toHaveValue("Un modello deve generalizzare, non memorizzare.");
    await page.keyboard.press("Escape");
    await expect(settings).toHaveCount(0);
    await page.screenshot({ path: "test-results/study.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("button", { name: "Torna alla biblioteca" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.locator(".slide-stage canvas")).toBeVisible();
    const mobileSlide = await page.locator(".slide-panel").boundingBox();
    const mobileChat = await page.locator(".chat-pane").boundingBox();
    const mobileComposer = await page.locator(".chat-pane form").boundingBox();
    expect(mobileChat!.y).toBeGreaterThanOrEqual(mobileSlide!.y + mobileSlide!.height - 2);
    expect(mobileComposer!.y + mobileComposer!.height).toBeLessThanOrEqual(846);
    await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
    await page.getByRole("button", { name: "Impostazioni della lettura", exact: true }).click();
    await settings.getByRole("textbox", { name: "Appunti della slide 1" }).fill("Appunto salvato tornando alla biblioteca.");
    await page.keyboard.press("Escape");
    await expect(settings).toHaveCount(0);
    await page.getByRole("button", { name: "Torna alla biblioteca" }).click();
    await expect(page.getByRole("heading", { name: formatCourseName(exam.name), exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Apri Introduzione al machine learning", exact: true }).click();
    await page.getByRole("button", { name: "Impostazioni della lettura", exact: true }).click();
    await expect(settings.getByRole("textbox", { name: "Appunti della slide 1" })).toHaveValue("Appunto salvato tornando alla biblioteca.");
    expect(errors).toEqual([]);
  } finally { await request.delete(`/api/documents/${doc.id}`); }
});

test("rifiuta upload non PDF e richieste da siti esterni", async ({ request }) => {
  const folder = await (await request.post("/api/folders", { data: { name: "Verifica upload" } })).json();
  const upload = await request.post("/api/documents", { multipart: { folderId: folder.id, file: { name: "invalid.pdf", mimeType: "application/pdf", buffer: Buffer.from("not a pdf") } } });
  expect(upload.status()).toBe(400);
  const blocked = await request.get("/api/documents", { headers: { Origin: "https://example.com" } });
  expect(blocked.status()).toBe(403);
});

test("mostra spiegazione e glossario della slide selezionata con AI simulata", async ({ page, request }) => {
  await page.route("**/api/status", route => route.fulfill({ json: { configured: true, provider: "OpenAI" } }));
  let analyzedPage = 0;
  await page.route("**/api/documents/*/analyze", async route => {
    analyzedPage = route.request().postDataJSON().page;
    await route.fulfill({ json: { notes: "", generatedAt: new Date().toISOString(), explanation: {
      title: "Imparare dagli esempi", language: "en", overview: "Il machine learning permette di individuare schemi nei dati e applicarli a situazioni nuove.",
      concepts: [{ title: "I dati di partenza", explanation: "Gli esempi forniscono le informazioni da cui il modello impara." }, { title: "Il modello", explanation: "Rappresenta le relazioni apprese e le usa per produrre una previsione." }],
      example: "Esempio aggiuntivo: un filtro antispam impara a riconoscere messaggi indesiderati osservando email già classificate.",
      takeaway: "Imparare significa riconoscere uno schema che funziona anche su dati nuovi.",
      glossary: [{ word: "learning", translation: "apprendimento", context: "Il processo con cui il modello migliora dagli esempi." }, { word: "prediction", translation: "previsione", context: "La risposta del modello su un nuovo dato." }],
    } } });
  });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto("/");
  await createExam(page);
  const upload = page.waitForResponse(r => r.url().endsWith("/api/documents") && r.request().method() === "POST");
  await page.getByLabel("Carica un PDF", { exact: true }).setInputFiles({ name: "Introduzione al machine learning.pdf", mimeType: "application/pdf", buffer: await readFile("public/esempio.pdf") });
  const doc = await (await upload).json() as StudyDocument;
  await page.getByRole("button", { name: `Apri ${doc.name.replace(/\.pdf$/i, "")}`, exact: true }).click();
  try {
    await page.getByRole("button", { name: "Mostra pannello inferiore" }).click();
    await page.getByRole("button", { name: "Analizza questa pagina", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Imparare dagli esempi" })).toBeVisible();
    await expect(page.locator(".glossary").getByText("apprendimento", { exact: true })).toBeVisible();
    expect(analyzedPage).toBe(1);
    await expect(page.locator(".slide-stage canvas")).toBeVisible();
    await page.screenshot({ path: "test-results/explanation-simulated.png", fullPage: true });
  } finally { await request.delete(`/api/documents/${doc.id}`); }
});
