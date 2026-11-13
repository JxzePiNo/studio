import { test, expect } from "@playwright/test";
import type { StudyDocument } from "../lib/types";

test("PDF and explanations survive reload and unchanged content revalidates without downloading slides", async ({ page }) => {
  await page.clock.install();
  const document: StudyDocument = { id: "cache-pdf", folderId: "cache-course", name: "Cache.pdf", pages: 3, size: 1000, currentPage: 1, createdAt: new Date().toISOString(), slides: { 1: { notes: "", explanation: { title: "Spiegazione salvata", language: "it", overview: "Contenuto persistente.", concepts: [], example: "", takeaway: "", glossary: [] } } } };
  let downloads = 0;
  let fullDocuments = 0;
  let validations = 0;
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/documents/cache-pdf/pdf") { downloads++; return route.fulfill({ path: "public/esempio.pdf", contentType: "application/pdf" }); }
    if (path === "/api/documents/cache-pdf") {
      if (route.request().headers()["if-none-match"] === '"content-v1"') { validations++; return route.fulfill({ status: 304, headers: { ETag: '"content-v1"', "X-Studio-Metadata": encodeURIComponent(JSON.stringify({ name: "Rinominato.pdf", currentPage: 1 })) } }); }
      fullDocuments++; return route.fulfill({ json: document, headers: { ETag: '"content-v1"' } });
    }
    const data = path === "/api/profile" ? { displayName: "Iacopo", studyProgram: "Informatica", onboardingCompleted: true, nickname: "studio_test", university: "Roma" }
      : path === "/api/status" ? { configured: true }
      : path === "/api/folders" ? [{ id: "cache-course", name: "Cache", createdAt: document.createdAt, color: "sky" }]
      : path === "/api/documents" ? [{ ...document, slides: undefined, analyzedPages: 1 }]
      : path === "/api/study-sessions" ? { sessions: [], activity: {}, todayPages: [] }
      : path.endsWith("/quiz") ? { quizzes: [] } : {};
    return route.fulfill({ json: data });
  });
  await page.goto("/esami/cache-course/documenti/cache-pdf");
  await expect(page.locator(".slide-stage canvas")).toBeVisible();
  await expect(page.locator(".explanation-content")).toContainText("Spiegazione salvata");
  await page.reload();
  await expect(page.locator(".slide-stage canvas")).toBeVisible();
  expect(downloads).toBe(1);
  expect(fullDocuments).toBe(1);
  await page.clock.fastForward(16_000);
  await page.reload();
  await expect(page.locator(".slide-stage canvas")).toBeVisible();
  await expect(page.locator(".reader-chat-panel h1")).toHaveText("Rinominato");
  expect(validations).toBe(1);
  expect(downloads).toBe(1);
  expect(fullDocuments).toBe(1);
});

test("reader toolbar restores after clean view and reading settings persist", async ({ page }) => {
  const template: StudyDocument = { id: "prefs-a", folderId: "prefs-course", name: "Primo.pdf", pages: 3, size: 1000, currentPage: 1, createdAt: new Date().toISOString(), slides: {} };
  const second = { ...template, id: "prefs-b", name: "Secondo.pdf" };
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/pdf")) return route.fulfill({ path: "public/esempio.pdf", contentType: "application/pdf" });
    const data = path === "/api/profile" ? { studyProgram: "Informatica", onboardingCompleted: true, nickname: "studio_test", university: "Roma" }
      : path === "/api/status" ? { configured: true }
      : path === "/api/folders" ? [{ id: "prefs-course", name: "Preferenze", createdAt: template.createdAt, color: "sky" }]
      : path === "/api/documents" ? [template, second].map(document => ({ ...document, slides: undefined, analyzedPages: 0 }))
      : path === "/api/documents/prefs-a" ? template
      : path === "/api/documents/prefs-b" ? second
      : path === "/api/study-sessions" ? { sessions: [], activity: {}, todayPages: [] }
      : path.endsWith("/quiz") ? { quizzes: [] } : {};
    return route.fulfill({ json: data });
  });
  await page.goto("/esami/prefs-course/documenti/prefs-a");
  await expect(page.locator(".slide-stage canvas")).toBeVisible();
  await page.getByRole("button", { name: "Pulisci schermata", exact: true }).click();
  await expect(page.getByRole("toolbar", { name: "Comandi del PDF" })).toBeHidden();
  await expect(page.getByRole("complementary", { name: "Tutor della slide" })).toBeVisible();
  await page.getByRole("button", { name: "Mostra tutti i controlli", exact: true }).click();
  await expect(page.getByRole("toolbar", { name: "Comandi del PDF" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("toolbar", { name: "Comandi del PDF" })).toBeVisible();
  await page.getByRole("button", { name: "Impostazioni della lettura", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Impostazioni della lettura", exact: true });
  const zoom = settings.getByRole("slider", { name: "Zoom del PDF", exact: true });
  await zoom.fill("1.4");
  await expect(zoom).toHaveValue("1.4");
  await settings.getByRole("button", { name: "Ripristina zoom", exact: true }).click();
  await expect(zoom).toHaveValue("1");
  await settings.getByRole("slider", { name: "Dimensione del testo", exact: true }).fill("18");
  await page.getByRole("button", { name: "Chiudi impostazioni", exact: true }).click();
  await expect(page.locator(".reader-navigation-island")).toBeVisible();
  await page.reload();
  await expect(page.locator(".reader-navigation-island")).toBeVisible();
  await page.getByRole("button", { name: "Impostazioni della lettura", exact: true }).click();
  await expect(page.getByRole("slider", { name: "Dimensione del testo", exact: true })).toHaveValue("18");
});

test("reading updates the cached page and refreshes history without a full document reload", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("studio-session:local:imported", "true"));
  const document: StudyDocument = { id: "read-cache", folderId: "read-course", name: "Lettura.pdf", pages: 3, size: 1000, currentPage: 1, createdAt: new Date().toISOString(), slides: {} };
  let revision = "v1";
  let documents = 0;
  let historyReads = 0;
  let readWrites = 0;
  let positions = 0;
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path.endsWith("/pdf")) return route.fulfill({ path: "public/esempio.pdf", contentType: "application/pdf" });
    if (path === "/api/documents/read-cache") {
      if (method === "PATCH") {
        expect(route.request().headers().prefer).toBe("return=minimal");
        const { page, read } = route.request().postDataJSON();
        const previousContentRevision = revision;
        if (read !== undefined) { document.slides[page] = { notes: "", read }; revision = "v2"; }
        else { document.currentPage = page; positions++; }
        const { slides, ...metadata } = document;
        return route.fulfill({ json: { ...metadata, page, previousContentRevision, contentRevision: revision, readPages: Object.values(slides).filter(slide => slide.read).length, ...(read !== undefined ? { slide: slides[page] } : {}) } });
      }
      documents++;
      return route.fulfill({ json: document, headers: { ETag: `"${revision}"` } });
    }
    if (path === "/api/study-sessions") {
      if (method === "POST") {
        expect(route.request().headers().prefer).toBe("return=minimal");
        if (route.request().postDataJSON().type === "read") readWrites++;
        return route.fulfill({ json: { ok: true } });
      }
      historyReads++;
      return route.fulfill({ json: { sessions: [], activity: {}, todayPages: [] } });
    }
    const data = path === "/api/profile" ? { studyProgram: "Informatica", onboardingCompleted: true, nickname: "studio_test", university: "Roma" }
      : path === "/api/status" ? { configured: true }
      : path === "/api/folders" ? [{ id: "read-course", name: "Lettura", createdAt: document.createdAt, color: "sky" }]
      : path === "/api/documents" ? [{ ...document, slides: undefined, analyzedPages: 0 }]
      : path.endsWith("/quiz") ? { quizzes: [] } : {};
    return route.fulfill({ json: data });
  });
  await page.goto("/esami/read-course/documenti/read-cache");
  await expect(page.locator(".slide-stage canvas")).toBeVisible();
  await expect.poll(() => historyReads).toBe(1);
  await page.evaluate(() => (globalThis.document.activeElement as HTMLElement)?.blur());
  await page.keyboard.press("Space");
  await expect(page.locator(".chat-slide-label")).toHaveText("Slide 2");
  await expect.poll(() => positions).toBe(1);
  await expect.poll(() => readWrites).toBe(1);
  await expect.poll(() => historyReads).toBe(2);
  expect(documents).toBe(1);
  await page.reload();
  await expect(page.locator(".chat-slide-label")).toHaveText("Slide 2");
  await page.getByRole("button", { name: "Pagina precedente", exact: true }).click();
  await expect(page.locator(".slide-stage")).toHaveClass(/is-read/);
  expect(documents).toBe(1);
});
