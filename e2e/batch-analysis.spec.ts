import { expect, test, type Page } from "@playwright/test";
import type { SlideData, StudyDocument } from "../lib/types";
import { createExam } from "./exam-helpers";

function explained(page: number): SlideData {
  return { notes: "", generatedAt: new Date().toISOString(), explanation: {
    title: `Spiegazione pagina ${page}`, language: "en", overview: "Una spiegazione simulata per verificare il flusso del documento.",
    concepts: [{ title: "Concetto", explanation: "Un concetto della slide." }], example: "Un esempio aggiuntivo.",
    takeaway: "Una frase da ricordare.", glossary: [{ word: "data", translation: "dati", context: "Gli esempi del modello." }],
  } };
}

async function setup(page: Page, cached: number[] = []) {
  let saved: StudyDocument | undefined;
  const calls: number[] = [];
  await page.route("**/api/status", route => route.fulfill({ json: { configured: true } }));
  await page.route("**/api/documents/*", async route => {
    if (route.request().method() !== "GET") return route.fallback();
    if (!saved) {
      saved = await (await route.fetch()).json() as StudyDocument;
      for (const p of cached) saved.slides[p] = explained(p);
    }
    await route.fulfill({ json: saved });
  });
  await page.goto("/");
  await createExam(page);
  const upload = page.waitForResponse(r => r.url().endsWith("/api/documents") && r.request().method() === "POST");
  await page.getByLabel("Carica un PDF", { exact: true }).setInputFiles("public/esempio.pdf");
  const doc = await (await upload).json() as StudyDocument;
  await page.getByRole("button", { name: `Apri ${doc.name.replace(/\.pdf$/i, "")}`, exact: true }).click();
  await expect(page.getByRole("heading", { name: "esempio" })).toBeVisible();
  await page.getByRole("button", { name: "Mostra pannello inferiore" }).click();
  return { id: doc.id, calls, save: (p: number) => { const slide = explained(p); saved!.slides[p] = slide; return slide; } };
}

test("analizza tutte le pagine mancanti, riutilizza la cache e mostra il risultato", async ({ page, request }) => {
  const state = await setup(page, [1]);
  await page.route("**/api/documents/*/analyze", async route => {
    const p = route.request().postDataJSON().page;
    state.calls.push(p);
    await route.fulfill({ json: state.save(p) });
  });
  try {
    await page.getByRole("spinbutton", { name: "Numero della slide" }).fill("2");
    await page.getByRole("button", { name: "Analizza tutto", exact: true }).click();
    await expect(page.getByText("Analisi completata", { exact: true })).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "Pagine analizzate" })).toHaveAttribute("value", "3");
    expect(state.calls).toEqual([2, 3]);
    await expect(page.getByRole("button", { name: "Analizza questa pagina", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Analizza tutto", exact: true })).toHaveCount(0);
    await page.getByRole("spinbutton", { name: "Numero della slide" }).fill("3");
    await expect(page.getByRole("heading", { name: "Spiegazione pagina 3" })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await request.delete(`/api/documents/${state.id}`); }
});

test("interrompe dopo la pagina in corso e riprende senza ripetere chiamate", async ({ page, request }) => {
  const state = await setup(page);
  let release: () => void = () => {};
  const blocked = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/documents/*/analyze", async route => {
    const p = route.request().postDataJSON().page;
    state.calls.push(p);
    if (p === 1) await blocked;
    await route.fulfill({ json: state.save(p) });
  });
  try {
    await page.getByRole("button", { name: "Analizza tutto", exact: true }).click();
    await expect.poll(() => state.calls).toEqual([1]);
    await expect(page.getByRole("button", { name: "Torna alla biblioteca", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Slide successiva", exact: true }).click();
    await expect(page.getByRole("spinbutton", { name: "Numero della slide" })).toHaveValue("2");
    await expect(page.getByRole("button", { name: "Analizza questa pagina", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Interrompi analisi", exact: true }).click();
    await expect(page.getByRole("button", { name: "Interruzione richiesta…" })).toBeDisabled();
    release();
    await expect(page.getByText("Analisi interrotta. Puoi riprendere quando vuoi.")).toBeVisible();
    expect(state.calls).toEqual([1]);
    await page.getByRole("button", { name: "Analizza tutto", exact: true }).click();
    await expect(page.getByText("Analisi completata", { exact: true })).toBeVisible();
    expect(state.calls).toEqual([1, 2, 3]);
  } finally { release(); await request.delete(`/api/documents/${state.id}`); }
});

test("si ferma al primo errore e conserva i progressi per il nuovo tentativo", async ({ page, request }) => {
  const state = await setup(page);
  let fail = true;
  await page.route("**/api/documents/*/analyze", async route => {
    const p = route.request().postDataJSON().page;
    state.calls.push(p);
    if (p === 2 && fail) return route.fulfill({ status: 502, json: { error: "Quota API esaurita." } });
    await route.fulfill({ json: state.save(p) });
  });
  try {
    await page.getByRole("button", { name: "Analizza tutto", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Analisi interrotta:" })).toContainText("Quota API esaurita");
    await expect(page.getByText("Analisi sospesa per un errore", { exact: true })).toBeVisible();
    expect(state.calls).toEqual([1, 2]);
    await expect(page.getByRole("progressbar", { name: "Pagine analizzate", exact: true })).toHaveAttribute("value", "1");
    fail = false;
    await page.getByRole("spinbutton", { name: "Numero della slide" }).fill("2");
    await page.getByRole("button", { name: "Analizza tutto", exact: true }).click();
    await expect(page.getByText("Analisi completata", { exact: true })).toBeVisible();
    expect(state.calls).toEqual([1, 2, 2, 3]);
  } finally { await request.delete(`/api/documents/${state.id}`); }
});

test("reader batch keeps analyzing after leaving the PDF and returning home", async ({ page, request }) => {
  const state = await setup(page);
  let release: () => void = () => {};
  const blocked = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/documents/*/analyze", async route => {
    const number = route.request().postDataJSON().page as number;
    state.calls.push(number);
    if (number === 1) await blocked;
    await route.fulfill({ json: state.save(number) });
  });
  try {
    await page.getByRole("button", { name: "Analizza tutto", exact: true }).click();
    await expect.poll(() => state.calls).toEqual([1]);
    await page.getByRole("button", { name: "Torna alla biblioteca", exact: true }).click();
    await expect(page.locator(".materials-list")).toBeVisible();
    await page.getByRole("button", { name: "Torna alla home", exact: true }).click();
    const island = page.getByRole("complementary", { name: "Avanzamento analisi in background" });
    await expect(island).toBeVisible();
    release();
    await expect(island).toContainText("100%");
    expect(state.calls).toEqual([1, 2, 3]);
    await page.goBack();
    await page.getByRole("button", { name: "Apri esempio", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Spiegazione pagina 1", exact: true })).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "Pagine analizzate", exact: true })).toHaveAttribute("value", "3");
  } finally { release(); await request.delete(`/api/documents/${state.id}`); }
});
