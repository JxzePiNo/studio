import { formatCourseName } from "../lib/course-name";
import { expect, test, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
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

async function setupCourse(page: Page, cachedFirst = false, options: { letters?: string[]; holdAll?: boolean; failName?: string; cachedComplete?: string[]; pageCount?: number } = {}) {
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
      await route.fulfill({ status: 502, json: { error: "Limite API raggiunto.", retryable: false } }); active--; return;
    }
    const slide = explained(pageNumber);
    document.slides[pageNumber] = slide;
    await route.fulfill({ json: slide });
    active--;
  });
  await page.goto("/");
  const pdf = await PDFDocument.create(); for (let index = 0; index < (options.pageCount ?? 8); index++) pdf.addPage();
  const buffer = Buffer.from(await pdf.save());
  async function addCourse(prefix: string, letters: string[], filePrefix = "Corso") {
    const folder = await createExam(page, prefix);
    await page.getByLabel("Carica PDF o immagini", { exact: true }).setInputFiles(letters.map(letter => ({ name: `${filePrefix} ${letter}.pdf`, mimeType: "application/pdf", buffer })));
    await expect(page.locator(".material-row")).toHaveCount(letters.length);
    await expect(page.getByRole("button", { name: "Analizza tutto", exact: true })).toBeEnabled();
    return folder;
  }
  const folder = await addCourse("Analisi del corso", options.letters || ["A", "B"]);
  return { folder, addCourse, saved, calls, release, maximumConcurrent: () => maximumConcurrent, expectedCalls: () => [...saved.values()].flatMap(document => Array.from({ length: document.pages }, (_, index) => index + 1).filter(number => !(cachedFirst && document.name === "Corso A.pdf" && number === 1)).map(number => `${document.name}:${number}`)) };
}

test("analizza tutti i PDF dell’esame in sequenza con avanzamento e stima del tempo", async ({ page, request }) => {
  const state = await setupCourse(page, false, { holdAll: true });
  try {
    const analysis = page.getByRole("region", { name: "Analisi di tutti i materiali", exact: true });
    await expect(analysis.getByRole("combobox")).toHaveCount(0);
    await analysis.getByRole("button", { name: "Analizza tutto", exact: true }).click();
    await expect.poll(() => state.calls.length).toBeGreaterThanOrEqual(2);
    const details = analysis.getByRole("button", { name: "Stato dei file", exact: true });
    await expect(details).toHaveAttribute("aria-expanded", "false");
    await expect(analysis.getByRole("list", { name: "File in analisi", exact: true })).toBeHidden();
    const compactCard = await analysis.boundingBox();
    const upload = page.locator(".exam-action-grid .upload-banner");
    const uploadCompact = await upload.boundingBox();
    expect(Math.abs(compactCard!.height - uploadCompact!.height)).toBeLessThanOrEqual(2);
    await details.click();
    await expect(analysis.locator(".course-analysis-timing")).toContainText("Tempo rimanente stimato");
    expect(Math.abs((await upload.boundingBox())!.height - uploadCompact!.height)).toBeLessThanOrEqual(2);
    await details.click();
    await expect(details).toHaveAttribute("aria-expanded", "false");
    await expect(analysis.getByRole("progressbar", { name: "Pagine analizzate dell’esame", exact: true })).toHaveAttribute("max", "16");
    state.release();
    await expect(analysis).toHaveCount(0);
    expect([...state.calls].sort()).toEqual(state.expectedCalls().sort());
    expect(state.calls).toHaveLength(16);
    expect(state.maximumConcurrent()).toBe(8);
    expect((await upload.boundingBox())!.width).toBeCloseTo((await page.locator(".exam-action-grid").boundingBox())!.width, 0);
    expect((await request.post("/api/documents", { multipart: { folderId: state.folder.id, file: { name: "Corso C.pdf", mimeType: "application/pdf", buffer: await readFile("public/esempio.pdf") } } })).ok()).toBe(true);
    // An upload outside this browser is picked up when the catalogue TTL expires.
    await page.clock.install();
    await page.clock.fastForward(31_000);
    await page.reload();
    await expect(analysis).toBeVisible();
  } finally {
    state.release();
    const documents = await (await request.get("/api/documents")).json() as DocumentSummary[];
    for (const document of documents.filter(item => item.folderId === state.folder.id)) await request.delete(`/api/documents/${document.id}`);
  }
});

test("a 700-page PDF starts 70 requests without a fixed global cap and stop drains all results", async ({ page, request }) => {
  const state = await setupCourse(page, false, { letters: ["A"], holdAll: true, pageCount: 700 });
  try {
    const analysis = page.getByRole("region", { name: "Analisi di tutti i materiali", exact: true });
    await analysis.getByRole("button", { name: "Analizza tutto", exact: true }).click();
    await expect.poll(() => state.calls.length).toBe(70);
    expect(state.maximumConcurrent()).toBe(70);
    expect(state.calls.map(call => Number(call.split(":")[1]))).toEqual(Array.from({ length: 70 }, (_, i) => i * 10 + 1));
    await analysis.getByRole("button", { name: "Interrompi analisi", exact: true }).click();
    state.release();
    await expect(analysis.getByText("Analisi interrotta. Puoi riprendere dalle pagine mancanti.", { exact: true })).toBeVisible();
    await expect(analysis.getByRole("progressbar")).toHaveAttribute("value", "70");
    expect(state.calls).toHaveLength(70);
  } finally { state.release(); await request.delete(`/api/folders/${state.folder.id}`); }
});

test("riutilizza la cache e riprende l’analisi dell’esame dopo un’interruzione", async ({ page, request }) => {
  const state = await setupCourse(page, true, { holdAll: true });
  try {
    const analysis = page.getByRole("region", { name: "Analisi di tutti i materiali", exact: true });
    await analysis.getByRole("button", { name: "Analizza tutto", exact: true }).click();
    await expect.poll(() => state.calls.length).toBe(8);
    await analysis.getByRole("button", { name: "Interrompi analisi", exact: true }).click();
    state.release();
    await expect(analysis.getByText("Analisi interrotta. Puoi riprendere dalle pagine mancanti.", { exact: true })).toBeVisible();
    await expect(analysis.getByRole("progressbar", { name: "Pagine analizzate dell’esame", exact: true })).toHaveAttribute("value", "9");
    expect(state.calls).toHaveLength(8);
    await analysis.getByRole("button", { name: "Analizza tutto", exact: true }).click();
    await expect(analysis).toHaveCount(0);
    expect([...state.calls].sort()).toEqual(state.expectedCalls().sort());
    expect(state.calls).toHaveLength(15);
    expect(state.calls).not.toContain("Corso A.pdf:1");
    expect(state.maximumConcurrent()).toBe(8);
  } finally {
    state.release();
    const documents = await (await request.get("/api/documents")).json() as DocumentSummary[];
    for (const document of documents.filter(item => item.folderId === state.folder.id)) await request.delete(`/api/documents/${document.id}`);
  }
});


test("all eight files run automatically, stop drains active pages and resume skips saved work", async ({ page, request }) => {
  const state = await setupCourse(page, false, { letters: ["A", "B", "C", "D", "E", "F", "G", "H"], holdAll: true });
  try {
    const analysis = page.getByRole("region", { name: "Analisi di tutti i materiali", exact: true });
    await expect(analysis.getByRole("combobox")).toHaveCount(0);
    await analysis.getByRole("button", { name: "Analizza tutto", exact: true }).click();
    await expect.poll(() => state.calls.length).toBe(32);
    await analysis.getByRole("button", { name: "Stato dei file", exact: true }).click();
    await expect(analysis.getByRole("list", { name: "File in analisi", exact: true }).locator("li")).toHaveCount(8);
    expect(new Set(state.calls.map(call => call.split(":")[0])).size).toBe(8);
    expect(state.maximumConcurrent()).toBe(32);
    await analysis.getByRole("button", { name: "Interrompi analisi", exact: true }).click();
    state.release();
    await expect(analysis.getByText("Analisi interrotta. Puoi riprendere dalle pagine mancanti.", { exact: true })).toBeVisible();
    expect(state.calls).toHaveLength(32);
    await expect(analysis.getByRole("progressbar")).toHaveAttribute("value", "32");
    await analysis.getByRole("button", { name: "Analizza tutto", exact: true }).click();
    await expect(analysis).toHaveCount(0);
    expect(state.calls).toHaveLength(64);
    expect(new Set(state.calls).size).toBe(64);
    expect(state.maximumConcurrent()).toBe(32);
    for (const name of ["A", "B", "C", "D", "E", "F", "G", "H"]) expect(state.calls.filter(call => call.startsWith(`Corso ${name}.pdf:`)).map(call => Number(call.split(":")[1])).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
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
    await expect.poll(() => state.calls.length).toBe(8);
    state.release();
    await expect(analysis.getByRole("alert")).toContainText("Limite API raggiunto");
    await expect(analysis.getByText("Analisi sospesa. I progressi sono salvati.", { exact: true })).toBeVisible();
    expect(state.calls.filter(call => call === "Corso A.pdf:1")).toHaveLength(1);
    const successfulPages = state.calls.filter(call => call.startsWith("Corso B.pdf:")).length;
    expect(successfulPages).toBeGreaterThanOrEqual(1);
    await expect(analysis.getByRole("progressbar")).toHaveAttribute("value", String(state.calls.length - 1));
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
    await page.reload();
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
    await expect.poll(() => state.calls.length).toBe(8);
    await expect(page.getByRole("button", { name: "Apri Corso A", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Apri Corso C", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Apri Corso C", exact: true }).click();
    await expect(page.locator(".slide-stage canvas")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pagina 1", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Torna alla biblioteca", exact: true })).toBeEnabled();
    await page.goBack();
    await expect(analysis.getByRole("button", { name: "Interrompi analisi", exact: true })).toBeEnabled();
    expect(state.calls).toHaveLength(8);
    await page.getByRole("button", { name: "Apri Corso C", exact: true }).click();
    await expect(page.locator(".slide-stage canvas")).toBeVisible();
    state.release();
    await expect.poll(() => state.calls.length).toBe(15);
    await page.getByRole("button", { name: "Torna alla biblioteca", exact: true }).click();
    await expect(analysis).toHaveCount(0);
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

test("course analysis continues through reader, home and another exam, with a hideable island", async ({ page, request }) => {
  const state = await setupCourse(page, false, { holdAll: true });
  try {
    await page.getByRole("button", { name: "Analizza tutto", exact: true }).click();
    await expect.poll(() => state.calls.length).toBe(8);
    const island = page.getByRole("complementary", { name: "Avanzamento analisi in background" });
    await page.getByRole("button", { name: /^Mostra notifiche/ }).click();
    await expect(island).toBeVisible();
    await island.hover();
    await island.getByRole("button", { name: "Riduci avanzamento analisi", exact: true }).click();
    await expect(island).toHaveCount(0);
    await page.getByRole("button", { name: /^Mostra notifiche/ }).click();
    await expect(island).toBeVisible();

    await page.getByRole("button", { name: "Chiudi notifiche", exact: true }).click();
    await page.getByRole("button", { name: "Apri Corso A", exact: true }).click();
    await expect(page.locator(".slide-stage canvas")).toBeVisible();
    await expect(island).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Analizza questa pagina", exact: true })).toBeDisabled();
    await page.goBack();
    await expect(page.locator(".materials-list")).toBeVisible();
    await page.getByRole("button", { name: "Torna alla home", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    const other = await createExam(page, "Altro esame durante analisi");
    await expect(page).toHaveURL(new RegExp(`/esami/${other.id}$`));
    await page.getByRole("button", { name: /^Mostra notifiche/ }).click();
    await expect(island).toContainText("0%");
    expect(state.calls).toHaveLength(8);
    state.release();
    await expect(island).toContainText("100%");
    await expect(island).toContainText("Tutte le spiegazioni sono pronte");
    expect(state.calls).toHaveLength(16);
    expect(new Set(state.calls).size).toBe(16);
    await page.getByRole("button", { name: "Chiudi notifiche", exact: true }).click();
    await page.getByRole("button", { name: new RegExp(formatCourseName(state.folder.name)) }).click();
    await expect(page.locator(".material-analysis-badge.is-analyzed")).toHaveCount(2);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: /^Mostra notifiche/ }).click();
    await expect(island).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: "test-results/background-island-mobile.png", fullPage: true });
  } finally {
    state.release();
    const documents = await (await request.get("/api/documents")).json() as DocumentSummary[];
    for (const document of documents.filter(item => item.folderId === state.folder.id)) await request.delete(`/api/documents/${document.id}`);
  }
});

test("two exams analyze concurrently and stopping one preserves the other's work", async ({ page, request }) => {
  const state = await setupCourse(page, false, { holdAll: true });
  const folderIds = [state.folder.id];
  try {
    const analysis = page.getByRole("region", { name: "Analisi di tutti i materiali", exact: true });
    await analysis.getByRole("button", { name: "Analizza tutto", exact: true }).click();
    await expect.poll(() => state.calls.length).toBe(8);
    const other = await state.addCourse("Seconda materia in parallelo", ["X", "Y"], "Secondo");
    folderIds.push(other.id);
    await analysis.getByRole("button", { name: "Analizza tutto", exact: true }).click();
    await expect.poll(() => state.calls.length).toBe(16);
    expect(state.maximumConcurrent()).toBe(16);

    const island = page.getByRole("complementary", { name: "Avanzamento analisi in background" });
    await page.getByRole("button", { name: /^Mostra notifiche/ }).click();
    await expect(island).toContainText(formatCourseName(state.folder.name));
    await expect(island).toContainText(formatCourseName(other.name));
    await expect(island.getByRole("button", { name: `Interrompi analisi ${formatCourseName(state.folder.name)}`, exact: true })).toBeEnabled();
    await island.getByRole("button", { name: `Interrompi analisi ${formatCourseName(state.folder.name)}`, exact: true }).click();
    await expect(island.getByRole("button", { name: `Interrompi analisi ${formatCourseName(other.name)}`, exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Chiudi notifiche", exact: true }).click();
    state.release();

    await expect(analysis).toHaveCount(0);
    expect(state.calls.filter(call => call.startsWith("Corso "))).toHaveLength(8);
    expect(state.calls.filter(call => call.startsWith("Secondo "))).toHaveLength(16);
    expect(new Set(state.calls).size).toBe(24);
    await page.getByRole("button", { name: new RegExp(formatCourseName(state.folder.name)) }).click();
    await expect(analysis.getByText("Analisi interrotta. Puoi riprendere dalle pagine mancanti.", { exact: true })).toBeVisible();
    await expect(analysis.getByRole("progressbar")).toHaveAttribute("value", "8");
    await analysis.getByRole("button", { name: "Analizza tutto", exact: true }).click();
    await expect(analysis).toHaveCount(0);
    expect(state.calls).toHaveLength(32);
    expect(new Set(state.calls).size).toBe(32);
  } finally {
    state.release();
    const documents = await (await request.get("/api/documents")).json() as DocumentSummary[];
    for (const document of documents.filter(item => folderIds.includes(item.folderId || ""))) await request.delete(`/api/documents/${document.id}`);
  }
});
