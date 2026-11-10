import { test, expect } from "@playwright/test";
import { createExam } from "./exam-helpers";
import type { Explanation, StudyDocument } from "../lib/types";

test("creates an exam, assigns an upload and opens a separate chat for each slide", async ({ page, request }) => {
  await page.route("**/api/status", route => route.fulfill({ json: { configured: true } }));
  await page.goto("/");
  const { name } = await createExam(page, "Analisi");
  const uploaded = page.waitForResponse(r => r.url().endsWith("/api/documents") && r.request().method() === "POST");
  await page.getByLabel("Carica un PDF", { exact: true }).setInputFiles("public/esempio.pdf");
  const doc = await (await uploaded).json();
  try {
    await page.getByRole("button", { name: "Mostra pannello inferiore" }).click();
    expect(doc.folderId).toBeTruthy();
    await expect(page.getByRole("tablist")).toHaveCount(0);
    await expect(page.getByRole("combobox")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Tutto PDF", exact: true })).toHaveAttribute("aria-pressed", "false");
    await page.route("**/api/documents/*/chat", async route => {
      const body = route.request().postDataJSON();
      expect(body.page).toBe(1);
      expect(body.scope).toBe("document");
      await route.fulfill({ json: [{ role: "user", content: body.question }, { role: "assistant", content: "Un modello generalizza dai dati." }] });
    });
    await page.getByRole("button", { name: "Tutto PDF", exact: true }).click();
    await expect(page.getByRole("button", { name: "Tutto PDF", exact: true })).toHaveAttribute("aria-pressed", "true");
    const question = page.getByRole("textbox", { name: "Domanda al tutor" });
    await question.fill("Cosa significa generalizzare?");
    await question.press("Shift+Enter");
    await expect(question).toHaveValue("Cosa significa generalizzare?\n");
    await question.press("Enter");
    await expect(page.locator(".chat-message.assistant")).toContainText("generalizza");
    await page.getByRole("button", { name: "Slide successiva", exact: true }).click();
    await expect(page.locator(".chat-message")).toHaveCount(0);
    await page.getByRole("button", { name: "Slide precedente", exact: true }).click();
    await expect(page.locator(".chat-message.assistant")).toContainText("generalizza");
    await page.reload();
    await expect(page.locator(".slide-stage canvas")).toBeVisible();
    await page.getByRole("button", { name: "Torna alla biblioteca" }).click();
    await expect(page.locator(".material-row")).toHaveCount(1);
  } finally { await request.delete(`/api/documents/${doc.id}`); }
});

test("la spiegazione salvata apre la chat come primo messaggio e si aggiorna senza duplicare le domande", async ({ page, request }) => {
  const explanation: Explanation = {
    title: "Il significato della generalizzazione", language: "it",
    overview: "Un modello generalizza quando affronta esempi nuovi oltre ai dati osservati.",
    concepts: [{ title: "Dati nuovi", explanation: "La valutazione richiede esempi distinti dall’addestramento." }],
    example: "Esempio aggiuntivo: riconoscere email mai viste prima.",
    takeaway: "Memorizzare non basta per generalizzare.", glossary: [],
  };
  let saved: StudyDocument | undefined;
  await page.route("**/api/status", route => route.fulfill({ json: { configured: true } }));
  await page.route(/\/api\/documents\/[^/]+$/, async route => {
    if (route.request().method() !== "GET") return route.fallback();
    if (!saved) {
      saved = await (await route.fetch()).json() as StudyDocument;
      saved.slides[1] = { notes: "", explanation };
    }
    await route.fulfill({ json: saved });
  });
  await page.route("**/api/documents/*/chat", async route => {
    const body = route.request().postDataJSON();
    expect(body.scope).toBe("slide");
    const question = body.question;
    const chat = [{ role: "user" as const, content: question }, { role: "assistant" as const, content: "Valuta il modello su esempi separati, così controlli la generalizzazione." }];
    saved!.slides[1].chat = chat;
    await route.fulfill({ json: chat });
  });
  await page.route("**/api/documents/*/analyze", async route => {
    saved!.slides[1] = { ...saved!.slides[1], explanation: { ...explanation, title: "Generalizzazione: spiegazione aggiornata", overview: "La capacità predittiva va misurata su dati indipendenti." }, generatedAt: new Date().toISOString() };
    await route.fulfill({ json: saved!.slides[1] });
  });
  await page.goto("/");
  const folder = await createExam(page, "Chat e spiegazioni");
  const uploaded = page.waitForResponse(response => response.url().endsWith("/api/documents") && response.request().method() === "POST");
  await page.getByLabel("Carica un PDF", { exact: true }).setInputFiles("public/esempio.pdf");
  const document = await (await uploaded).json() as StudyDocument;
  try {
    await expect(page.getByRole("tablist")).toHaveCount(0);
    const seed = page.locator('.chat-message.assistant[data-source="analysis"]');
    await expect(seed).toHaveCount(1);
    await expect(seed).toContainText(explanation.title);
    await expect(seed).toContainText(explanation.overview);
    await expect(seed).toContainText(explanation.example);
    await expect(page.locator(".chat-message.assistant").first()).toHaveAttribute("data-source", "analysis");
    await seed.locator(".concept").hover();
    const deepen = seed.locator(".concept").getByRole("button", { name: "Approfondisci" });
    await expect(deepen).toHaveCSS("opacity", "1");
    const deepened = page.waitForRequest(r => r.url().endsWith(`/api/documents/${document.id}/chat`));
    await deepen.click();
    expect((await deepened).postDataJSON().question).toContain("Dati nuovi");
    await expect(page.locator(".chat-thinking")).toHaveCount(0);
    await page.getByRole("textbox", { name: "Domanda al tutor", exact: true }).fill("Come controllo che il modello generalizzi?");
    await page.getByRole("button", { name: "Invia domanda", exact: true }).click();
    await expect(page.locator(".chat-message.assistant")).toHaveCount(2);
    await expect(seed).toHaveCount(1);
    await page.getByRole("button", { name: "Mostra pannello inferiore", exact: true }).click();
    await page.getByRole("button", { name: "Slide successiva", exact: true }).click();
    await expect(page.locator(".chat-message")).toHaveCount(0);
    await page.getByRole("button", { name: "Slide precedente", exact: true }).click();
    await expect(seed).toHaveCount(1);
    await expect(page.locator(".chat-message.assistant")).toHaveCount(2);
    await page.getByRole("button", { name: "Impostazioni della lettura", exact: true }).click();
    const settings = page.getByRole("dialog", { name: "Impostazioni della lettura", exact: true });
    const regenerated = page.waitForResponse(response => response.url().endsWith(`/api/documents/${document.id}/analyze`));
    await settings.getByRole("button", { name: "Rigenera analisi della pagina", exact: true }).click();
    await regenerated;
    if (await settings.count()) await page.keyboard.press("Escape");
    await expect(settings).toHaveCount(0);
    await expect(seed).toHaveCount(1);
    await expect(seed).toContainText("Generalizzazione: spiegazione aggiornata");
    await expect(seed).not.toContainText(explanation.overview);
    await expect(page.locator(".chat-message.assistant")).toHaveCount(2);
    await expect(page.locator(".chat-message.user")).toContainText("Come controllo che il modello generalizzi?");
    expect(saved!.slides[1].chat).toHaveLength(2);
    await page.reload();
    await expect(seed).toHaveCount(1);
    await expect(seed).toContainText("Generalizzazione: spiegazione aggiornata");
    await expect(page.locator(".chat-message.assistant")).toHaveCount(2);
    await expect(page.locator(".chat-message.user")).toHaveCount(1);
  } finally { await request.delete(`/api/documents/${document.id}`); }
});
