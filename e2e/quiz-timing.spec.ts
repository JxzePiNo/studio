import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { StudyQuiz } from "../lib/quiz";

for (const mode of ["question", "total"] as const) test(`${mode} timer expires correctly and survives reload`, async ({ page, request }) => {
  await page.clock.install();
  const folder = await (await request.post("/api/folders", { data: { name: `Quiz a tempo ${Date.now()}` } })).json();
  const doc = await (await request.post("/api/documents", { multipart: { folderId: folder.id, file: { name: "Lezione.pdf", mimeType: "application/pdf", buffer: await readFile("public/esempio.pdf") } } })).json();
  const quiz: StudyQuiz = { id: `timing-${mode}`, documentId: doc.id, documentName: doc.name, title: "Quiz a tempo", createdAt: new Date().toISOString(), topics: [], timing: { mode, seconds: mode === "question" ? 60 : 120 }, questions: [0, 1].map(index => ({ type: "multiple-choice", question: `Problema ${index + 1}`, topic: "Argomento", page: 1, options: ["Corretta", "Alternativa B", "Alternativa C", "Alternativa D"], correctIndex: 0, modelAnswer: "", explanation: "Una soluzione ragionata." })) };
  await page.route(`**/api/documents/${doc.id}/quiz`, route => route.fulfill({ json: { topics: [], quizzes: [{ ...quiz, questionCount: 2 }] } }));
  await page.route(`**/api/documents/${doc.id}/quiz/${quiz.id}`, route => route.fulfill({ json: quiz }));
  const open = async () => {
    await page.getByRole("list", { name: "Quiz di Lezione.pdf" }).getByRole("button", { name: /Quiz a tempo/ }).first().click();
    return page.getByRole("region", { name: "Quiz: Quiz a tempo", exact: true });
  };
  try {
    await page.goto(`/esami/${folder.id}`);
    const player = await open();
    if (mode === "question") {
      await expect(player.getByRole("timer")).toHaveText("01:00");
      await page.clock.fastForward(60_100);
      await expect(player).toContainText("Nessuna risposta inviata per questa domanda.");
      await player.getByRole("button", { name: "Prossima domanda", exact: true }).click();
      await expect(player.getByRole("timer")).toHaveText("01:00");
      await player.getByRole("radio", { name: "Corretta", exact: true }).check();
      await player.getByRole("button", { name: "Continua", exact: true }).click();
      await page.clock.fastForward(120_000);
      await expect(player.getByRole("timer")).toHaveText("In pausa");
      await player.getByRole("button", { name: "Vedi risultato", exact: true }).click();
      await expect(player).toContainText("1 / 2 risposte chiuse corrette.");
    } else {
      await expect(player.getByRole("timer")).toHaveText("02:00");
      await player.getByRole("radio", { name: "Corretta", exact: true }).check();
      await player.getByRole("button", { name: "Continua", exact: true }).click();
      await page.clock.fastForward(30_000);
      await player.getByRole("button", { name: "Prossima domanda", exact: true }).click();
      await page.reload();
      await open();
      await expect(player.getByRole("timer")).not.toHaveText("02:00");
      await page.clock.fastForward(95_000);
      await expect(player).toContainText("Tempo totale scaduto.");
      await expect(player).toContainText("1 / 2 risposte chiuse corrette.");
      await expect(player.getByRole("radio")).toHaveCount(0);
    }
  } finally { await request.delete(`/api/folders/${folder.id}`); }
});
