import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createExam } from "./exam-helpers";
import type { ChatMessage, StudyDocument } from "../lib/types";
import type { StudyQuiz } from "../lib/quiz";

test("quiz modal configures a mixed PDF quiz, continues away from reader and restores answers", async ({ page, request }) => {
  await page.route("**/api/status", route => route.fulfill({ json: { configured: true } }));
  await page.goto("/");
  const exam = await createExam(page, "Quiz di ripasso");
  const uploaded = page.waitForResponse(response => response.url().endsWith("/api/documents") && response.request().method() === "POST");
  await page.getByLabel("Carica un PDF", { exact: true }).setInputFiles({ name: "Reti.pdf", mimeType: "application/pdf", buffer: await readFile("public/esempio.pdf") });
  const document = await (await uploaded).json();
  let messages: ChatMessage[] = [];
  const payloads: Record<string, unknown>[] = [];
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/api/documents/${document.id}/quiz`, route => route.fulfill({ json: { topics: ["Reti", "Protocolli"], pages: 3, quizzes: [] } }));
  await page.route(`**/api/documents/${document.id}`, async route => {
    if (route.request().method() !== "GET") return route.fallback();
    const saved = await (await route.fetch()).json() as StudyDocument;
    saved.slides[1] = { ...saved.slides[1], notes: saved.slides[1]?.notes || "", chat: messages };
    await route.fulfill({ json: saved });
  });
  await page.route(`**/api/documents/${document.id}/chat`, async route => {
    const payload = route.request().postDataJSON(); payloads.push(payload);
    if (payloads.length === 1) await held;
    const quiz: StudyQuiz = { id: randomUUID(), title: "Ripasso delle reti", documentId: document.id, documentName: "Reti.pdf", createdAt: new Date().toISOString(), topics: ["Reti"], questions: [
      { type: "multiple-choice", question: "Quale livello gestisce il routing?", topic: "Reti", page: 1, options: ["Rete", "Fisico", "Applicazione", "Presentazione"], correctIndex: 0, modelAnswer: "", explanation: "Il livello rete instrada i pacchetti." },
      { type: "open", question: "Descrivi il routing.", topic: "Reti", page: 2, options: [], correctIndex: null, modelAnswer: "La scelta del percorso dei pacchetti.", explanation: "Vanno descritti nodi e tabelle di instradamento." },
      { type: "true-false", question: "Un protocollo stabilisce regole di comunicazione.", topic: "Reti", page: 3, options: ["Vero", "Falso"], correctIndex: 0, modelAnswer: "", explanation: "Definisce messaggi e regole condivise." },
    ] };
    messages = [...messages, { role: "user", content: payload.question }, { role: "assistant", content: "Quiz pronto", quiz }];
    await route.fulfill({ json: messages });
  });
  try {
    await expect(page.locator(".slide-stage canvas")).toBeVisible();
    await page.getByRole("button", { name: "Crea quiz", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Crea un quiz", exact: true });
    await dialog.getByLabel("Numero di domande", { exact: true }).fill("3");
    await dialog.getByRole("combobox", { name: "Tipo di domande", exact: true }).selectOption("mixed");
    await dialog.getByLabel("Domande aperte", { exact: true }).fill("1");
    await dialog.getByLabel("Domande vero / falso", { exact: true }).fill("1");
    await dialog.getByRole("checkbox", { name: "Reti", exact: true }).check();
    await page.screenshot({ path: "test-results/quiz-modal.png" });
    await dialog.getByRole("button", { name: "Genera quiz", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => payloads.length).toBe(1);
    expect(payloads[0].quiz).toEqual({ count: 3, openCount: 1, trueFalseCount: 1, topics: ["Reti"], difficulty: "intermedia" });
    await page.getByRole("button", { name: "Torna alla biblioteca", exact: true }).click();
    release();
    await page.getByRole("button", { name: /La risposta è pronta/ }).click();
    const card = page.getByRole("region", { name: "Quiz: Ripasso delle reti", exact: true });
    await expect(card).toBeVisible();
    await card.getByRole("group", { name: "Risposte alla domanda 1", exact: true }).getByRole("radio").first().check();
    await card.getByRole("button", { name: "Continua", exact: true }).click();
    await expect(card.locator('[data-quiz-mood="happy"]')).toBeVisible();
    await card.getByRole("button", { name: "Prossima domanda", exact: true }).click();
    await card.getByRole("textbox", { name: "Risposta alla domanda 2", exact: true }).fill("Scelta del percorso dei pacchetti.");
    await card.getByRole("button", { name: "Continua", exact: true }).click();
    await expect(card).toContainText("Risposta di riferimento");
    await card.getByRole("button", { name: "Prossima domanda", exact: true }).click();
    await card.getByRole("group", { name: "Risposte alla domanda 3", exact: true }).getByRole("radio").first().check();
    await card.getByRole("button", { name: "Continua", exact: true }).click();
    await card.getByRole("button", { name: "Vedi risultato", exact: true }).click();
    await expect(card).toContainText("2 / 2 risposte chiuse corrette.");
    await page.reload();
    await expect(card).toContainText("2 / 2 risposte chiuse corrette.");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: "test-results/quiz-mobile.png" });
    const question = page.getByRole("textbox", { name: "Domanda al tutor", exact: true });
    await question.fill("Genera un quiz di 3 domande miste sulle reti.");
    await question.press("Enter");
    await expect.poll(() => payloads.length).toBe(2);
    expect(payloads[1]).not.toHaveProperty("quiz");
    await expect(page.getByRole("region", { name: "Quiz: Ripasso delle reti", exact: true })).toHaveCount(2);
  } finally { release(); await request.delete(`/api/documents/${document.id}`); await request.delete(`/api/folders/${exam.id}`); }
});
