import { test, expect } from "@playwright/test";
import { createExam } from "./exam-helpers";
import type { StudyQuiz } from "../lib/quiz";

test("quiz returns to course with a pending child and no chat card", async ({ page, request }) => {
  await page.route("**/api/status", route => route.fulfill({ json: { configured: true } }));
  await page.goto("/");
  const folder = await createExam(page, "Quiz in background");
  const upload = page.waitForResponse(response => response.url().endsWith("/api/documents") && response.request().method() === "POST");
  await page.getByLabel("Carica PDF o immagini", { exact: true }).setInputFiles("public/esempio.pdf");
  const document = await (await upload).json();
  const quiz: StudyQuiz = { id: "pending-quiz-test", documentId: document.id, documentName: document.name, createdAt: new Date().toISOString(), title: "Ripasso delle reti", topics: ["Reti"], questions: [{ type: "true-false", question: "Un protocollo stabilisce regole di comunicazione.", topic: "Reti", page: 1, options: ["Vero", "Falso"], correctIndex: 0, modelAnswer: "", explanation: "Definisce le regole dei messaggi." }] };
  let created = false;
  let submitted: unknown;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/api/documents/${document.id}/quiz`, async route => {
    if (route.request().method() === "POST") { submitted = route.request().postDataJSON(); await held; created = true; return route.fulfill({ status: 201, json: quiz }); }
    return route.fulfill({ json: { topics: ["Reti"], pages: 3, quizzes: created ? [{ ...quiz, questionCount: 1 }] : [] } });
  });
  await page.route(`**/api/documents/${document.id}/quiz/${quiz.id}`, route => route.fulfill({ json: quiz }));
  try {
    await expect(page).toHaveURL(`/esami/${folder.id}`);
    await page.getByRole("button", { name: "Apri esempio", exact: true }).click();
    await expect(page.locator(".slide-stage canvas")).toBeVisible();
    await page.getByRole("button", { name: "Crea quiz", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Crea un quiz", exact: true });
    await dialog.getByRole("button", { name: /Personalizza/ }).click();
    const all = dialog.getByRole("button", { name: "Tutto il PDF", exact: true });
    await expect(all).toHaveAttribute("aria-pressed", "true");
    await dialog.getByRole("checkbox", { name: "Reti", exact: true }).check();
    await expect(all).toHaveAttribute("aria-pressed", "false");
    await all.click();
    await dialog.getByRole("spinbutton", { name: "Numero di domande", exact: true }).fill("1");
    await dialog.getByRole("combobox", { name: "Tipo di domande", exact: true }).click();
    await page.getByRole("option", { name: "Vero / falso", exact: true }).click();
    await dialog.getByRole("button", { name: "Genera quiz", exact: true }).click();
    await expect(page).toHaveURL(`/esami/${folder.id}`);
    await expect(page.getByRole("list", { name: `Quiz di ${document.name}` })).toContainText("Quiz in creazione");
    await expect(page.locator(".chat-pane")).toHaveCount(0);
    expect(submitted).toMatchObject({ count: 1, trueFalseCount: 1, topics: [] });
    release();
    await expect(page.getByRole("list", { name: `Quiz di ${document.name}` })).toContainText(quiz.title);
    await expect(page.getByText("Quiz in creazione", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: /^Mostra notifiche/ }).click();
    await page.getByRole("button", { name: /Il quiz è pronto/ }).click();
    const player = page.getByRole("region", { name: `Quiz: ${quiz.title}`, exact: true });
    await expect(player).toBeVisible();
    await player.getByRole("radio", { name: "Vero", exact: true }).check();
    await player.getByRole("button", { name: "Continua", exact: true }).click();
    await player.getByRole("button", { name: "Vedi risultato", exact: true }).click();
    await expect(player).toContainText("1 / 1 risposte chiuse corrette.");
    await expect(page).toHaveURL(`/esami/${folder.id}`);
    await page.screenshot({ path: "test-results/quiz-background-course.png", fullPage: true });
  } finally { release(); await request.delete(`/api/documents/${document.id}`); await request.delete(`/api/folders/${folder.id}`); }
});
