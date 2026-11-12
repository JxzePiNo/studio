import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

for (const [width, timerMode] of [[1280, "question"], [390, "question"], [1280, "none"], [390, "total"]] as const) test(`quick quiz confirms ${timerMode} timer and scope at ${width}px`, async ({ page, request }) => {
  await page.setViewportSize({ width, height: 844 });
  const folder = await (await request.post("/api/folders", { data: { name: `Quiz rapido ${Date.now()}` } })).json();
  const doc = await (await request.post("/api/documents", { multipart: { folderId: folder.id, file: { name: "Lezione.pdf", mimeType: "application/pdf", buffer: await readFile("public/esempio.pdf") } } })).json();
  await request.patch(`/api/documents/${doc.id}`, { data: { page: 2 } });
  await page.route("**/api/status", route => route.fulfill({ json: { configured: true } }));
  let requests = 0;
  await page.route(`**/api/documents/${doc.id}/quiz`, route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { topics: ["Argomento salvato"], quizzes: [] } });
    requests++; expect(route.request().postDataJSON()).toEqual({ count: 10, openCount: 0, trueFalseCount: 0, difficulty: "avanzata", topics: [], throughPage: 2, ...(timerMode === "none" ? {} : { timing: { mode: timerMode, seconds: timerMode === "question" ? 45 : 180 } }) });
    return route.fulfill({ status: 201, json: { id: "quick-quiz" } });
  });
  try {
    await page.goto(`/esami/${folder.id}/documenti/${doc.id}`);
    await expect(page.locator(".slide-stage canvas")).toBeVisible();
    if (width < 700) await page.getByRole("button", { name: "Apri chat con Tony", exact: true }).click();
    await page.getByRole("button", { name: "Crea quiz", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Crea un quiz", exact: true });
    await expect(dialog.getByRole("spinbutton")).toHaveCount(0);
    await dialog.getByRole("button", { name: /Personalizza/ }).click();
    await expect(dialog.getByRole("spinbutton", { name: "Numero di domande", exact: true })).toHaveValue("10");
    expect(requests).toBe(0);
    await dialog.getByRole("button", { name: "Indietro", exact: true }).click();
    await page.screenshot({ path: `test-results/quiz-choice-${width}.png` });
    await dialog.getByRole("button", { name: /Fino a dove sei arrivato/ }).click();
    expect(requests).toBe(0);
    await expect(dialog.getByRole("spinbutton", { name: "Secondi per domanda", exact: true })).toHaveValue("60");
    await dialog.getByRole("combobox", { name: "Modalità timer", exact: true }).selectOption(timerMode);
    if (timerMode === "question") await dialog.getByRole("spinbutton", { name: "Secondi per domanda", exact: true }).fill("45");
    if (timerMode === "total") {
      await expect(dialog.getByRole("spinbutton", { name: "Minuti totali", exact: true })).toHaveValue("10");
      await dialog.getByRole("spinbutton", { name: "Minuti totali", exact: true }).fill("3");
    }
    await dialog.getByRole("button", { name: "Genera quiz rapido", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => requests).toBe(1);
    await expect(page).toHaveURL(new RegExp(`/esami/${folder.id}$`));
  } finally { await request.delete(`/api/folders/${folder.id}`); }
});
