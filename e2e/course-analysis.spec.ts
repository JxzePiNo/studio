import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { DocumentSummary, SlideData, StudyDocument } from "../lib/types";
import { createExam } from "./exam-helpers";

function explained(page: number): SlideData {
  return { notes: "", explanation: {
    title: `Pagina ${page}`, language: "it", overview: "Una spiegazione simulata della pagina.",
    concepts: [{ title: "Concetto", explanation: "Un concetto da ricordare." }],
    example: "Un esempio aggiuntivo.", takeaway: "Una frase da ricordare.", glossary: [],
  } };
}

async function setupCourse(page: Page, cachedFirst = false, options: { letters?: string[]; holdAll?: boolean; failName?: string; cachedComplete?: string[] } = {}) {
  const saved = new Map<string, StudyDocument>();
  const calls: string[] = [];
  let active = 0;
  let maximumConcurrent = 0;
  let release: () => void = () => {};
  const firstResponse = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/status", route => route.fulfill({ json: { configured: true } }));
  await page.route("**/api/documents", async route => {
    if (route.request().method() !== "GET") return route.fallback();
    const response = await route.fetch();
    const summaries = await response.json() as DocumentSummary[];
    await route.fulfill({ json: summaries.map(summary => ({ ...summary, analyzedPages: options.cachedComplete?.includes(summary.name) ? summary.pages : saved.has(summary.id) ? Object.values(saved.get(summary.id)!.slides).filter(slide => slide.explanation).length : cachedFirst && summary.name === "Corso A.pdf" ? 1 : summary.analyzedPages })) });
  });
  await page.route(/\/api\/documents\/[^/]+$/, async route => {
    if (route.request().method() !== "GET") return route.fallback();
    const id = new URL(route.request().url()).pathname.split("/").pop()!;
    if (!saved.has(id)) {
      const document = await (await route.fetch()).json() as StudyDocument;
      if (options.cachedComplete?.includes(document.name)) for (let number = 1; number <= document.pages; number++) document.slides[number] = explained(number);
      if (cachedFirst && document.name === "Corso A.pdf") document.slides[1] = explained(1);
      saved.set(id, document);
    }
    await route.fulfill({ json: saved.get(id) });
  });
  await page.route("**/api/documents/*/analyze", async route => {
    const id = new URL(route.request().url()).pathname.split("/").at(-2)!;
    const pageNumber = route.request().postDataJSON().page as number;
    const document = saved.get(id)!;
    calls.push(`${document.name}:${pageNumber}`);
    active++; maximumConcurrent = Math.max(maximumConcurrent, active);
    if (calls.length === 1 || options.holdAll) await firstResponse;
    if (document.name === options.failName && pageNumber === 1) {
      await route.fulfill({ status: 502, json: { error: "Limite API raggiunto." } }); active--; return;
    }
    const slide = explained(pageNumber);
    document.slides[pageNumber] = slide;
    await route.fulfill({ json: slide });
    active--;
  });
  await page.goto("/");
  const folder = await createExam(page, "Analisi del corso");
  const buffer = await readFile("public/esempio.pdf");
  await page.getByLabel("Carica un PDF", { exact: true }).setInputFiles((options.letters || ["A", "B"]).map(letter => ({ name: `Corso ${letter}.pdf`, mimeType: "application/pdf", buffer })));
  await expect(page.locator(".material-row")).toHaveCount((options.letters || ["A", "B"]).length);
  await expect(page.getByRole("button", { name: "Analizza tutto", exact: true })).toBeEnabled();
  return { folder, saved, calls, release, maximumConcurrent: () => maximumConcurrent, expectedCalls: () => [...saved.values()].flatMap(document => [1, 2, 3].filter(number => !(cachedFirst && document.name === "Corso A.pdf" && number === 1)).map(number => `${document.name}:${number}`)) };
}

test("analizza tutti i PDF dell’esame in sequenza con avanzamento e stima del tempo", async ({ page, request }) => {
  const state = await setupCourse(page);
  try {
    const analysis = page.getByRole("region", { name: "Analisi di tutti i materiali", exact: true });
    await analysis.getByRole("combobox", { name: "File in parallelo", exact: true }).click();
    await page.getByRole("option", { name: "1 file alla volta", exact: true }).click();
    await analysis.getByRole("button", { name: "Analizza tutto", exact: true }).click();
    await expect.poll(() => state.calls.length).toBe(1);
    expect(state.calls).toEqual(state.expectedCalls().slice(0, 1));
    await expect(analysis.locator(".course-analysis-timing")).toContainText("Tempo rimanente stimato");
    await expect(analysis.getByRole("progressbar", { name: "Pagine analizzate dell’esame", exact: true })).toHaveAttribute("max", "6");
    state.release();
    await expect(analysis.getByText("Analisi completata", { exact: true })).toBeVisible();
    await expect(analysis.getByRole("progressbar", { name: "Pagine analizzate dell’esame", exact: true })).toHaveAttribute("value", "6");
    await expect(analysis.getByRole("button", { name: "Tutto analizzato", exact: true })).toBeDisabled();
    expect(state.calls).toEqual(state.expectedCalls());
    expect(state.calls).toHaveLength(6);
    expect(state.maximumConcurrent()).toBe(1);
  } finally {
    state.release();
    const documents = await (await request.get("/api/documents")).json() as DocumentSummary[];
    for (const document of documents.filter(item => item.folderId === state.folder.id)) await request.delete(`/api/documents/${document.id}`);
  }
});

test("riutilizza la cache e riprende l’analisi dell’esame dopo un’interruzione", async ({ page, request }) => {
  const state = await setupCourse(page, true);
  try {
    const analysis = page.getByRole("region", { name: "Analisi di tutti i materiali", exact: true });
    await analysis.getByRole("combobox", { name: "File in parallelo", exact: true }).click();
    await page.getByRole("option", { name: "1 file alla volta", exact: true }).click();
    await analysis.getByRole("button", { name: "Analizza tutto", exact: true }).click();
    await expect.poll(() => state.calls.length).toBe(1);
    expect(state.calls).toEqual(state.expectedCalls().slice(0, 1));
    await analysis.getByRole("button", { name: "Interrompi analisi", exact: true }).click();
    state.release();
    await expect(analysis.getByText("Analisi interrotta. Puoi riprendere dalle pagine mancanti.", { exact: true })).toBeVisible();
    await expect(analysis.getByRole("progressbar", { name: "Pagine analizzate dell’esame", exact: true })).toHaveAttribute("value", "2");
    expect(state.calls).toEqual(state.expectedCalls().slice(0, 1));
    await analysis.getByRole("button", { name: "Analizza tutto", exact: true }).click();
    await expect(analysis.getByText("Analisi completata", { exact: true })).toBeVisible();
    expect(state.calls).toEqual(state.expectedCalls());
    expect(state.calls).toHaveLength(5);
    expect(state.calls).not.toContain("Corso A.pdf:1");
    expect(state.maximumConcurrent()).toBe(1);
  } finally {
    state.release();
    const documents = await (await request.get("/api/documents")).json() as DocumentSummary[];
    for (const document of documents.filter(item => item.folderId === state.folder.id)) await request.delete(`/api/documents/${document.id}`);
  }
});


test("six files run together, stop drains active pages and resume skips saved work", async ({ page, request }) => {
  const state = await setupCourse(page, false, { letters: ["A", "B", "C", "D", "E", "F", "G"], holdAll: true });
  try {
    const analysis = page.getByRole("region", { name: "Analisi di tutti i materiali", exact: true });
    await analysis.getByRole("combobox", { name: "File in parallelo", exact: true }).click();
    await page.getByRole("option", { name: "6 file insieme", exact: true }).click();
    await analysis.getByRole("button", { name: "Analizza tutto", exact: true }).click();
    await expect.poll(() => state.calls.length).toBe(6);
    await expect(analysis.getByRole("list", { name: "File in analisi", exact: true }).locator("li")).toHaveCount(6);
    await expect(analysis.getByRole("combobox", { name: "File in parallelo", exact: true })).toBeDisabled();
    expect(new Set(state.calls.map(call => call.split(":")[0])).size).toBe(6);
    expect(state.maximumConcurrent()).toBe(6);
    await analysis.getByRole("button", { name: "Interrompi analisi", exact: true }).click();
    state.release();
    await expect(analysis.getByText("Analisi interrotta. Puoi riprendere dalle pagine mancanti.", { exact: true })).toBeVisible();
    expect(state.calls).toHaveLength(6);
    await expect(analysis.getByRole("progressbar")).toHaveAttribute("value", "6");
    await analysis.getByRole("button", { name: "Analizza tutto", exact: true }).click();
    await expect(analysis.getByText("Analisi completata", { exact: true })).toBeVisible();
    expect(state.calls).toHaveLength(21);
    expect(new Set(state.calls).size).toBe(21);
    expect(state.maximumConcurrent()).toBe(6);
    for (const name of ["A", "B", "C", "D", "E", "F", "G"]) expect(state.calls.filter(call => call.startsWith(`Corso ${name}.pdf:`)).map(call => Number(call.split(":")[1]))).toEqual([1, 2, 3]);
    await expect(analysis.getByRole("progressbar")).toHaveAttribute("value", "21");
  } finally {
    state.release();
    const documents = await (await request.get("/api/documents")).json() as DocumentSummary[];
    for (const document of documents.filter(item => item.folderId === state.folder.id)) await request.delete(`/api/documents/${document.id}`);
  }
});

test("a parallel failure preserves other active results before reporting the error", async ({ page, request }) => {
  const state = await setupCourse(page, false, { letters: ["A", "B"], holdAll: true, failName: "Corso A.pdf" });
  try {
    const analysis = page.getByRole("region", { name: "Analisi di tutti i materiali", exact: true });
    await analysis.getByRole("button", { name: "Analizza tutto", exact: true }).click();
    await expect.poll(() => state.calls.length).toBe(2);
    state.release();
    await expect(analysis.getByRole("alert")).toContainText("Limite API raggiunto");
    await expect(analysis.getByText("Analisi sospesa. I progressi sono salvati.", { exact: true })).toBeVisible();
    expect(state.calls).toHaveLength(2);
    await expect(analysis.getByRole("progressbar")).toHaveAttribute("value", "1");
    await expect(analysis.getByRole("button", { name: "Analizza tutto", exact: true })).toBeEnabled();
  } finally {
    state.release();
    const documents = await (await request.get("/api/documents")).json() as DocumentSummary[];
    for (const document of documents.filter(item => item.folderId === state.folder.id)) await request.delete(`/api/documents/${document.id}`);
  }
});


test("completed files open during course analysis and material badges update without interrupting it", async ({ page, request }) => {
  const state = await setupCourse(page, true, { letters: ["A", "B", "C"], holdAll: true, cachedComplete: ["Corso C.pdf"] });
  try {
    const analysis = page.getByRole("region", { name: "Analisi di tutti i materiali", exact: true });
    const row = (name: string) => page.locator(".material-row").filter({ hasText: name });
    await expect(row("Corso A").getByRole("status")).toHaveText("Parzialmente analizzato");
    await expect(row("Corso A").getByRole("status")).toHaveCSS("background-color", "rgb(255, 246, 220)");
    await expect(row("Corso B").getByRole("status")).toHaveText("Da analizzare");
    await expect(row("Corso B").getByRole("status")).toHaveCSS("background-color", "rgb(250, 233, 231)");
    await expect(row("Corso C").getByRole("status")).toHaveText("Analizzato");
    await expect(row("Corso C").getByRole("status")).toHaveCSS("background-color", "rgb(232, 244, 235)");
    await expect(page.locator(".materials-list")).not.toContainText(/\d+\/\d+ spiegate/);
    await analysis.getByRole("button", { name: "Analizza tutto", exact: true }).click();
    await expect.poll(() => state.calls.length).toBe(2);
    await expect(page.getByRole("button", { name: "Apri Corso A", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Apri Corso C", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Apri Corso C", exact: true }).click();
    await expect(page.locator(".slide-stage canvas")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pagina 1", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Torna alla biblioteca", exact: true })).toBeEnabled();
    await page.goBack();
    await expect(analysis.getByRole("button", { name: "Interrompi analisi", exact: true })).toBeEnabled();
    expect(state.calls).toHaveLength(2);
    await page.getByRole("button", { name: "Apri Corso C", exact: true }).click();
    await expect(page.locator(".slide-stage canvas")).toBeVisible();
    state.release();
    await expect.poll(() => state.calls.length).toBe(5);
    await page.getByRole("button", { name: "Torna alla biblioteca", exact: true }).click();
    await expect(analysis.getByText("Analisi completata", { exact: true })).toBeVisible();
    await expect(page.locator(".material-analysis-badge.is-analyzed")).toHaveCount(3);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(row("Corso C").getByRole("status")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: "test-results/material-status-mobile.png", fullPage: true });
  } finally {
    state.release();
    const documents = await (await request.get("/api/documents")).json() as DocumentSummary[];
    for (const document of documents.filter(item => item.folderId === state.folder.id)) await request.delete(`/api/documents/${document.id}`);
  }
});
