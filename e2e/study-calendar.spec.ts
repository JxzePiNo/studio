import { expect, test } from "@playwright/test";

for (const width of [1280, 390]) test(`study calendar plans every course and adapts saved pace at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.clock.setFixedTime(new Date("2026-11-15T12:00:00Z"));
  const courseId = "11111111-1111-4111-8111-111111111111", otherId = "22222222-2222-4222-8222-222222222222";
  const docId = "33333333-3333-4333-8333-333333333333", otherDoc = "44444444-4444-4444-8444-444444444444";
  let measured = false;
  let folders = [{ id: courseId, name: "Analisi", createdAt: "2026-11-01", examDate: "2026-11-18", pagesPerHour: 10 }, { id: otherId, name: "Fisica", createdAt: "2026-11-01", examDate: "2026-11-18", pagesPerHour: 10 }];
  const documents = [{ id: docId, folderId: courseId, name: "Analisi.pdf", pages: 100, readPages: 10 }, { id: otherDoc, folderId: otherId, name: "Fisica.pdf", pages: 50, readPages: 20 }].map(document => ({ ...document, size: 1000, analyzedPages: 0, createdAt: "2026-11-01", currentPage: 1 }));
  const pages = Array.from({ length: 5 }, (_, index) => ({ documentId: docId, page: index + 1 }));
  const session = { id: "55555555-5555-4555-8555-555555555555", day: "2026-11-15", startedAt: "2026-11-15T09:00:00Z", endedAt: "2026-11-15T10:00:00Z", durationMs: 3600000, pages, pagesRead: 5, documents: [{ id: docId, name: "Analisi.pdf", pagesRead: 5 }] };
  await page.route("**/api/documents", route => route.fulfill({ json: documents }));
  await page.route("**/api/folders", route => route.fulfill({ json: folders }));
  await page.route(`**/api/folders/${courseId}`, route => {
    folders = folders.map(folder => folder.id === courseId ? { ...folder, ...route.request().postDataJSON() } : folder);
    return route.fulfill({ json: folders[0] });
  });
  await page.route("**/api/study-sessions**", route => route.fulfill({ json: route.request().method() === "GET" ? { sessions: measured ? [session] : [], activity: {}, todayPages: [] } : { ok: true } }));
  await page.goto("/calendario");
  const calendar = page.getByRole("region", { name: "Calendario di studio", exact: true });
  await expect(calendar).toBeVisible();
  const agenda = page.getByRole("complementary", { name: "Studio del giorno selezionato", exact: true });
  await expect(agenda).toContainText("4 h");
  await expect(agenda).toContainText("30 pagine");
  await expect(agenda).toContainText("10 pagine");
  await page.getByRole("button", { name: /^18 novembre 2026:/ }).click();
  await expect(agenda).toContainText("Nessuna pagina da studiare");
  await expect(agenda).toContainText("Scadenze");
  await calendar.getByRole("button", { name: "Oggi", exact: true }).click();
  const course = calendar.getByRole("article").filter({ has: page.getByRole("heading", { name: "Analisi", exact: true }) });
  await course.locator("summary").first().click();
  await page.getByRole("spinbutton", { name: "Pagine all’ora Analisi", exact: true }).fill("20");
  await page.getByRole("button", { name: "Salva piano Analisi", exact: true }).click();
  await expect(agenda).toContainText("2 h 30 min");
  measured = true;
  await page.getByRole("button", { name: "Aggiorna piano", exact: true }).click();
  await expect(course).toContainText("Ritmo adattato");
  await expect(agenda).toContainText("3 h");
  await expect(course).toContainText("15 pagine/ora");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/study-calendar-${width}.png`, fullPage: true });
  await page.reload();
  await expect(course).toContainText("15 pagine/ora");
  if (width === 390) {
    const navigation = page.getByRole("navigation", { name: "Navigazione principale", exact: true });
    await expect(navigation.getByRole("button", { name: "Calendario", exact: true })).toHaveAttribute("aria-current", "page");
    await navigation.getByRole("button", { name: "Home", exact: true }).click();
    await expect(calendar).toHaveCount(0);
    await navigation.getByRole("button", { name: "Calendario", exact: true }).click();
    await expect(calendar).toBeVisible();
    await page.goBack();
    await expect(calendar).toHaveCount(0);
    await page.goForward();
    await expect(calendar).toBeVisible();
  }
});
