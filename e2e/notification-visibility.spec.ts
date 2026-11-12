import { expect, test, type Page } from "@playwright/test";
import { createExam } from "./exam-helpers";

for (const width of [1280, 390]) test(`eye and notification controls stay centered and Tony opens in a central popup at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await page.addInitScript(() => localStorage.setItem("studio-studybar-position", JSON.stringify({ x: 10, y: 400 })));
  await page.goto("/");
  const eye = page.getByRole("button", { name: "Nascondi riepilogo studio", exact: true });
  const bell = page.getByRole("button", { name: "Mostra notifiche", exact: true });
  await expect(eye).toBeVisible(); await expect(bell).toBeVisible();
  const left = (await eye.boundingBox())!, right = (await bell.boundingBox())!;
  expect(Math.abs((left.x + right.x + right.width) / 2 - width / 2)).toBeLessThan(2);
  expect(left.y).toBe(right.y); expect(right.x - left.x - left.width).toBe(8);
  await expect(page.getByRole("button", { name: "Sposta riepilogo studio" })).toHaveCount(0);
  const summary = page.getByRole("region", { name: "Riepilogo studio", exact: true });
  const initial = (await summary.boundingBox())!;
  expect(initial.y).toBeLessThan(100);
  await eye.click(); await expect(summary).toHaveCount(0);
  const restore = page.getByRole("button", { name: "Mostra riepilogo studio", exact: true });
  expect((await restore.boundingBox())!.x).toBe(left.x);
  expect((await bell.boundingBox())!.x).toBe(right.x);
  await restore.click(); await expect(summary).toBeVisible();
  await bell.click();
  const popup = page.getByRole("dialog", { name: "Notifiche", exact: true });
  await expect(popup).toContainText("Nessuna notifica qui.");
  await expect(popup.getByRole("region", { name: "Tony e le notifiche" }).getByRole("img")).toBeVisible();
  const box = (await popup.boundingBox())!;
  expect(Math.abs(box.x + box.width / 2 - right.x - right.width / 2)).toBeLessThan(2);
  expect(box.y).toBeGreaterThan(right.y + right.height);
  expect(box.y).toBeLessThan(right.y + right.height + 16);
  await page.screenshot({ path: `test-results/tony-notifications-${width}.png` });
  await page.keyboard.press("Escape"); await expect(popup).toHaveCount(0);
  await expect(bell).toBeFocused();
});

async function openReader(page: Page) {
  await page.route("**/api/status", route => route.fulfill({ json: { configured: true } }));
  await page.goto("/");
  const folder = await createExam(page, "Notifiche nascoste");
  await page.getByLabel("Carica PDF o immagini", { exact: true }).setInputFiles("public/esempio.pdf");
  await page.getByRole("button", { name: "Apri esempio", exact: true }).click({ position: { x: 20, y: 20 }, timeout: 5000 });
  await page.getByRole("button", { name: /^Mostra notifiche/ }).click();
  await page.getByRole("button", { name: "Chiudi notifiche", exact: true }).click();
  return folder;
}

test("hidden chat notifications stay hidden, show a badge and preserve the preference after reload", async ({ page, request }) => {
  const folder = await openReader(page);
  await page.route("**/api/documents/*/chat", route => {
    const question = route.request().postDataJSON().question;
    return route.fulfill({ json: [{ role: "user", content: question }, { role: "assistant", content: `Risposta a ${question}` }] });
  });
  const notifications = page.getByRole("region", { name: "Notifiche del tutor", exact: true });
  async function ask(question: string) {
    await page.getByRole("textbox", { name: "Domanda al tutor", exact: true }).fill(question);
    await page.getByRole("button", { name: "Invia domanda", exact: true }).click();
    await expect(page.getByText(`Risposta a ${question}`, { exact: true })).toBeVisible();
  }
  try {
    await ask("prima domanda");
    await expect(notifications).toHaveCount(0);
    await page.getByRole("button", { name: "Mostra notifiche, 1 nuova", exact: true }).click();
    await expect(notifications).toBeVisible();
    await page.getByRole("button", { name: "Chiudi notifiche", exact: true }).click();
    await expect(notifications).toBeHidden();
    await expect(page.getByRole("button", { name: "Mostra notifiche", exact: true })).toBeVisible();
    await ask("seconda domanda");
    await expect(notifications).toBeHidden();
    const bell = page.getByRole("button", { name: "Mostra notifiche, 1 nuova", exact: true });
    await expect(bell).toBeVisible();
    await expect(bell).toHaveText("1");
    await bell.click();
    await expect(notifications).toBeVisible();
    await page.getByRole("button", { name: "Chiudi notifica del tutor", exact: true }).click();
    await ask("terza domanda");
    await expect(notifications).toBeHidden();
    await expect(bell).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "Mostra notifiche", exact: true })).toBeVisible();
    await expect(notifications).toBeHidden();
  } finally { await request.delete(`/api/folders/${folder.id}`); }
});

test("a new analysis does not reopen hidden notifications when the job changes", async ({ page, request }) => {
  const folder = await openReader(page);
  await page.route("**/api/documents/*/analyze", route => {
    const number = route.request().postDataJSON().page;
    return route.fulfill({ json: { notes: "", explanation: {
      title: `Analisi pagina ${number}`, language: "it", overview: "Spiegazione simulata.", concepts: [], example: "", takeaway: "", glossary: [],
    } } });
  });
  const progress = page.getByRole("complementary", { name: "Avanzamento analisi in background", exact: true });
  try {
    await page.getByRole("button", { name: "Analizza questa pagina", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Analisi pagina 1", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Mostra notifiche, 1 nuova", exact: true }).click();
    await expect(progress).toBeVisible();
    await page.getByRole("button", { name: "Chiudi notifiche", exact: true }).click();
    await expect(progress).toBeHidden();
    await page.getByRole("button", { name: "Pagina successiva", exact: true }).click();
    await page.getByRole("button", { name: "Analizza questa pagina", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Analisi pagina 2", exact: true })).toBeVisible();
    await expect(progress).toBeHidden();
    await page.getByRole("button", { name: "Mostra notifiche, 1 nuova", exact: true }).click();
    await expect(progress).toBeVisible();
  } finally { await request.delete(`/api/folders/${folder.id}`); }
});
