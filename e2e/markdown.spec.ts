import { test, expect } from "@playwright/test";
import { createExam } from "./exam-helpers";
import type { ChatMessage, Explanation, StudyDocument } from "../lib/types";

const explanation: Explanation = {
  title: "La media aritmetica", language: "it",
  overview: "Una **sintesi** con `n` osservazioni.",
  concepts: [{ title: "Il calcolo", explanation: "1. Somma i valori.\n2. Dividi per il numero di osservazioni." }],
  example: "Con i dati $2, 4, 6$ la media vale $4$.",
  takeaway: String.raw`Ricorda la formula \(\bar{x}=\frac{1}{n}\sum_i x_i\).`, glossary: [],
};
const answer = [
  "## Un metodo chiaro", "", "Parti dai **dati osservati** e considera la *media*.", "",
  "- Somma le osservazioni.", "- Dividi per il numero di valori.", "",
  "1. Controlla i dati.", "2. Calcola il risultato.", "",
  "| Passaggio | Risultato |", "| --- | --- |", "| Somma | 12 |", "| Media | 4 |", "",
  "> La media usa tutti i dati.", "", "Usa `len(valori)` per contarli.", "",
  "```python", "valori = [2, 4, 6]", "media = sum(valori) / len(valori)", "print(media)", "```", "",
  String.raw`Una formula inline: \(x^2\).`, "", String.raw`\[\bar{x}=\frac{1}{n}\sum_{i=1}^{n} x_i\]`, "",
  "[Un riferimento](https://example.org/lezione)", "", "[Non eseguire](javascript:alert(1))", "",
  '<script>window.markdownInjected = true</script>', '<img src="x" onerror="window.markdownInjected = true">',
].join("\n");

test("tutor Markdown renders lists, tables, highlighted code and formulas safely on mobile", async ({ page, request, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.route("**/api/status", route => route.fulfill({ json: { configured: true } }));
  let saved: StudyDocument;
  await page.route(/\/api\/documents\/[^/]+$/, async route => {
    if (route.request().method() !== "GET") return route.fallback();
    if (!saved) { saved = await (await route.fetch()).json(); saved.slides[1] = { notes: "", explanation }; }
    return route.fulfill({ json: saved });
  });
  await page.route("**/api/documents/*/chat", async route => {
    const question = route.request().postDataJSON().question;
    const messages: ChatMessage[] = [{ role: "user", content: question }, { role: "assistant", content: answer }];
    saved.slides[1].chat = messages;
    await route.fulfill({ json: messages });
  });
  await page.goto("/");
  await createExam(page, "Markdown");
  const uploaded = page.waitForResponse(r => r.url().endsWith("/api/documents") && r.request().method() === "POST");
  await page.getByLabel("Carica PDF o immagini", { exact: true }).setInputFiles("public/esempio.pdf");
  const doc = await (await uploaded).json();
  await page.getByRole("button", { name: `Apri ${doc.name.replace(/\.pdf$/i, "")}`, exact: true }).click();
  try {
    const initial = page.locator(".chat-analysis-message");
    await expect(initial.locator(".overview strong")).toHaveText("sintesi");
    await expect(initial.locator(".concept ol li")).toHaveCount(2);
    await expect(initial.locator(".takeaway .katex")).toHaveCount(1);
    await expect(initial.locator(".takeaway .katex .mord").first()).not.toHaveCSS("display", "block");
    let termRequests = 0;
    await page.route("**/api/documents/*/term", async route => {
      termRequests++;
      expect(route.request().postDataJSON().term).toBe("sintesi");
      await route.fulfill({ json: { explanation: "Una sintesi riunisce le informazioni essenziali." } });
    });
    await initial.locator(".overview strong").evaluate(element => {
      const range = document.createRange(); range.selectNodeContents(element);
      const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    });
    await page.getByRole("button", { name: "Spiega la selezione", exact: true }).click();
    const note = page.getByRole("dialog");
    await expect(note).toContainText("Una sintesi riunisce le informazioni essenziali.");
    await page.screenshot({ path: "test-results/selection-note.png" });
    await page.getByRole("button", { name: "Chiudi spiegazione", exact: true }).click();
    const chip = initial.getByRole("button", { name: "Spiega sintesi", exact: true });
    await expect(chip).toBeVisible();
    await chip.click();
    await expect(note).toContainText("Una sintesi riunisce le informazioni essenziali.");
    expect(termRequests).toBe(1);
    await page.getByRole("button", { name: "Chiudi spiegazione", exact: true }).click();
    await expect(page.locator(".chat-conversation .chat-message")).toHaveCount(0);
    await expect(initial.locator(".takeaway .katex")).toHaveCount(1);
    await page.getByRole("textbox", { name: "Domanda al tutor", exact: true }).fill("# Puoi spiegare con esempi?");
    await page.getByRole("button", { name: "Invia domanda", exact: true }).click();
    const reply = page.locator(".chat-conversation .chat-message.assistant");
    await expect(reply.getByRole("heading", { name: "Un metodo chiaro" })).toBeVisible();
    await expect(reply.getByRole("heading")).toHaveCSS("font-size", "18.9px");
    await expect(reply.locator("strong").filter({ hasText: "dati osservati" })).toHaveCSS("font-size", "14px");
    await expect(reply.locator("ul li")).toHaveCount(2);
    await expect(reply.locator("ol li")).toHaveCount(2);
    await expect(reply.getByRole("table")).toContainText("Risultato");
    await expect(reply.locator("blockquote")).toContainText("tutti i dati");
    await expect(reply.locator("code.language-python .hljs-built_in").first()).toBeAttached();
    await expect(reply.locator(".katex")).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Spiega sintesi", exact: true })).toBeVisible();
    await expect(reply.locator(".katex-error")).toHaveCount(0);
    await expect(reply.getByRole("link", { name: "Un riferimento" })).toHaveAttribute("rel", "noopener noreferrer");
    await expect(reply.locator('a[href^="javascript:"]')).toHaveCount(0);
    await expect(reply.locator("script, img")).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { markdownInjected?: boolean }).markdownInjected)).toBeUndefined();
    await expect(page.locator(".chat-conversation .chat-message.user p")).toHaveText("# Puoi spiegare con esempi?");
    await reply.getByRole("button", { name: "Copia codice", exact: true }).click();
    await expect(reply.getByRole("button", { name: "Codice copiato", exact: true })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("media = sum(valori) / len(valori)");
    await page.screenshot({ path: "test-results/markdown-desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: "test-results/markdown-mobile.png" });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.reload();
    await expect(reply.getByRole("heading", { name: "Un metodo chiaro" })).toBeVisible();
    await expect(reply.locator(".katex")).toHaveCount(2);
    await page.getByRole("button", { name: "Spiega sintesi", exact: true }).click();
    await expect(note).toContainText("Una sintesi riunisce le informazioni essenziali.");
    expect(termRequests).toBe(1);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(note).toBeVisible();
    await page.screenshot({ path: "test-results/selection-note-mobile.png" });
  } finally { await request.delete(`/api/documents/${doc.id}`); }
});
