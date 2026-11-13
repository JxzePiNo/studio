import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { SavedQuizResult } from "../lib/quiz";

test("quiz children open, rename and delete from the parent PDF", async ({ page, request }) => {
  const folder = await (await request.post("/api/folders", { data: { name: `Quiz figli ${Date.now()}` } })).json();
  const uploaded = await request.post("/api/documents", { multipart: { folderId: folder.id, file: { name: "Lezione.pdf", mimeType: "application/pdf", buffer: await readFile("public/esempio.pdf") } } });
  const document = await uploaded.json();
  let title = "Ripasso della lezione";
  let deleted = false;
  let latestResult: SavedQuizResult | undefined;
  let releaseLoading!: () => void;
  const loading = new Promise<void>(resolve => { releaseLoading = resolve; });
  let releaseExplanation!: () => void;
  const explanation = new Promise<void>(resolve => { releaseExplanation = resolve; });
  const quiz = { id: "test-child-quiz", documentId: document.id, documentName: "Lezione.pdf", title, createdAt: new Date().toISOString(), topics: [], questions: [{ type: "open", question: "Cosa hai imparato?", topic: "Ripasso", page: 1, options: [], correctIndex: null, modelAnswer: "Concetti chiave.", explanation: "Rivedi i passaggi." }, { type: "multiple-choice", question: "Quanto fa 2 + 2?", topic: "Numeri", page: 1, options: ["4", "5", "6", "7"], correctIndex: 0, modelAnswer: "", explanation: "Due coppie formano quattro elementi." }, { type: "true-false", question: "2 + 2 fa 4.", topic: "Numeri", page: 1, options: ["Vero", "Falso"], correctIndex: 0, modelAnswer: "", explanation: "Il risultato della somma vale quattro." }] };
  await page.route(`**/api/documents/${document.id}/quiz`, route => route.fulfill({ json: { topics: [], pages: 3, quizzes: deleted ? [] : [{ ...quiz, title, latestResult, questionCount: quiz.questions.length }] } }));
  await page.route(`**/api/documents/${document.id}/quiz/${quiz.id}/result`, route => {
    expect(route.request().postDataJSON().answers).toMatchObject({ 1: "1", 2: "0" });
    latestResult = { correct: 1, total: 2, grade: 15, percentage: 50, passed: false, completedAt: new Date().toISOString() };
    return route.fulfill({ json: latestResult });
  });
  await page.route(`**/api/documents/${document.id}/quiz/${quiz.id}`, async route => {
    if (route.request().method() === "GET") await loading;
    if (route.request().method() === "PATCH") title = route.request().postDataJSON().title;
    if (route.request().method() === "DELETE") deleted = true;
    await route.fulfill({ json: route.request().method() === "DELETE" ? { ok: true } : { ...quiz, title } });
  });
  await page.route(`**/api/documents/${document.id}/quiz/${quiz.id}/explain`, async route => {
    expect(route.request().postDataJSON()).toEqual({ questionIndex: 1, selectedIndex: 1 });
    await explanation;
    return route.fulfill({ json: { explanation: "Due coppie formano quattro elementi. Cinque aggiunge un elemento che non è presente." } });
  });
  try {
    await page.goto(`/esami/${folder.id}`);
    const children = page.getByRole("list", { name: "Quiz di Lezione.pdf" });
    await expect(children).toContainText("Quiz 1 - Ripasso della lezione");
    await expect(children).toContainText(/Quiz · 3 domande · ~3 min · \d{2}\/\d{2}\/\d{4}/);
    await children.getByRole("button", { name: /Ripasso della lezione/ }).first().click();
    await expect(page.getByRole("status")).toContainText("Caricamento quiz in corso.");
    await expect(page.getByText("Tony sta preparando il tuo quiz.")).toBeVisible();
    releaseLoading();
    await expect(page.getByRole("dialog", { name: title, exact: true })).toContainText("Cosa hai imparato?");
    const player = page.getByRole("region", { name: `Quiz: ${title}`, exact: true });
    await expect(player.getByRole("button", { name: "Continua", exact: true })).toBeDisabled();
    await player.getByRole("textbox", { name: "Risposta alla domanda 1" }).fill("Ho imparato i concetti chiave.");
    await player.getByRole("button", { name: "Continua", exact: true }).click();
    await player.getByRole("button", { name: "Prossima domanda", exact: true }).click();
    await expect(player.getByRole("textbox")).toHaveCount(0);
    await player.getByRole("radio", { name: "5", exact: true }).check();
    await expect(player).not.toContainText("Due coppie formano quattro elementi.");
    await player.getByRole("button", { name: "Continua", exact: true }).click();
    await expect(player.locator('[data-quiz-mood="wrong"]')).toBeVisible();
    await expect(player.getByRole("tab", { name: "Risposta", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(player.getByRole("region", { name: "Risposta corretta", exact: true })).toContainText("4");
    await expect(player.getByRole("region", { name: "La tua risposta errata", exact: true })).toContainText("5");
    await page.evaluate(() => document.documentElement.dataset.theme = "dark");
    for (const name of ["Risposta corretta", "La tua risposta errata"]) {
      const answer = player.getByRole("region", { name, exact: true });
      const contrast = await answer.evaluate(element => {
        const luminance = (color: string) => {
          const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(value => { const channel = value / 255; return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4; });
          return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
        };
        const background = luminance(getComputedStyle(element).backgroundColor);
        return Math.min(...Array.from(element.querySelectorAll("h3, p")).map(text => { const foreground = luminance(getComputedStyle(text).color); return (Math.max(background, foreground) + .05) / (Math.min(background, foreground) + .05); }));
      });
      expect(contrast, `Night mode contrast for ${name}`).toBeGreaterThanOrEqual(4.5);
    }
    await expect(player.getByText("Tony sta preparando la spiegazione…", { exact: true })).toBeVisible();
    await player.getByRole("tab", { name: "Domanda", exact: true }).click();
    await expect(player.getByRole("radio", { name: "5", exact: true })).toBeChecked();
    await expect(player.getByRole("radio", { name: "5", exact: true })).toBeDisabled();
    await player.getByRole("tab", { name: "Risposta", exact: true }).click();
    releaseExplanation();
    await expect(player.getByRole("region", { name: "Spiegazione della risposta", exact: true })).toContainText("Due coppie formano quattro elementi.");
    await expect(player.getByText("Tony sta preparando la spiegazione…", { exact: true })).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: "test-results/quiz-player-wrong-mobile.png", fullPage: true });
    await player.getByRole("button", { name: "Prossima domanda", exact: true }).click();
    await player.getByRole("radio", { name: "Vero", exact: true }).check();
    await player.getByRole("button", { name: "Continua", exact: true }).click();
    await expect(player.locator('[data-quiz-mood="happy"]')).toBeVisible();
    await player.getByRole("button", { name: "Vedi risultato", exact: true }).click();
    await expect(player.getByRole("status")).toContainText("1 / 2 risposte chiuse corrette.");
    await page.screenshot({ path: "test-results/quiz-player-complete.png", fullPage: true });
    await page.getByRole("button", { name: "Chiudi quiz", exact: true }).click();
    await expect(children.getByLabel("Ultimo punteggio: 15 su 30", { exact: true })).toBeVisible();
    await page.reload();
    await expect(children.getByLabel("Ultimo punteggio: 15 su 30", { exact: true })).toBeVisible();
    await children.getByText(title, { exact: true }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Rinomina", exact: true }).click();
    await page.getByRole("textbox", { name: "Nome del quiz" }).fill("Ripasso finale");
    await page.getByRole("button", { name: "Salva nome", exact: true }).click();
    await expect(children).toContainText("Ripasso finale");
    await children.getByRole("button", { name: "Azioni quiz Ripasso finale" }).click();
    await page.getByRole("menuitem", { name: "Elimina quiz", exact: true }).click();
    await page.getByRole("dialog", { name: "Elimina quiz", exact: true }).getByRole("button", { name: "Elimina quiz", exact: true }).click();
    await expect(children).toHaveCount(0);
    await expect(page.locator(".material-row")).toContainText("Lezione");
  } finally { releaseLoading(); releaseExplanation(); await request.delete(`/api/documents/${document.id}`); await request.delete(`/api/folders/${folder.id}`); }
});
