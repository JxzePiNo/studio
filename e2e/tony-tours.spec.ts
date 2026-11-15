import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

async function flags(request: APIRequestContext, values: { home: boolean; course: boolean; reader: boolean }) {
  for (const [section, seen] of Object.entries(values)) expect((await request.patch("/api/tours", { data: { section, seen } })).ok()).toBe(true);
}
test.afterEach(async ({ request }) => flags(request, { home: true, course: true, reader: true }));
async function finish(page: Page, name: string) {
  const tour = page.getByRole("dialog", { name, exact: true });
  for (let index = 0; index < 15 && await tour.count(); index++) {
    const step = await tour.getAttribute("data-tour-step");
    await expect(page.locator(`[data-tour-highlight="${step}"]`)).toBeVisible();
    await expect.poll(async () => {
      const rect = await tour.boundingBox(), size = page.viewportSize()!;
      return !!rect && rect.x >= 8 && rect.y >= 8 && rect.x + rect.width <= size.width - 8 && rect.y + rect.height <= size.height - 8;
    }).toBe(true);
    const next = tour.getByRole("button", { name: "Avanti", exact: true });
    if (await next.count()) { await next.click(); await expect(tour).not.toHaveAttribute("data-tour-step", step!); }
    else { await tour.getByRole("button", { name: "Finito!", exact: true }).click(); break; }
  }
  await expect(tour).toHaveCount(0);
}

for (const width of [1280, 390]) test(`Tony introduces the home once and replays it from account at ${width}px`, async ({ page, request }) => {
  test.setTimeout(60000);
  await flags(request, { home: false, course: true, reader: true });
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/");
  const tour = page.getByRole("dialog", { name: "Tour Home", exact: true });
  await expect(tour).toBeVisible();
  await expect(tour).toHaveAttribute("data-tour-step", "create");
  await expect(tour).not.toHaveAttribute("aria-modal", "true");
  await expect(page.locator("body")).toHaveCSS("pointer-events", "auto");
  await expect.poll(async () => {
    const a = await page.locator('[data-tour-highlight="create"]').boundingBox();
    const b = await page.locator(".exam-overview-heading button").boundingBox();
    return a && b ? Math.abs(a.x - (b.x - 6)) : 1000;
  }).toBeLessThan(3);
  // The page stays interactive; Tony pauses for a dialog opened by the user.
  await page.locator(".exam-overview-heading button").click();
  const newExam = page.getByRole("dialog", { name: "Nuovo esame", exact: true });
  await expect(newExam).toBeVisible();
  await expect(tour).toHaveCount(0);
  await newExam.getByRole("button", { name: "Chiudi nuovo esame", exact: true }).click();
  await expect(tour).toBeVisible();
  await page.screenshot({ path: `test-results/tony-home-${width}.png` });
  await tour.getByRole("button", { name: "Avanti", exact: true }).click();
  await expect(tour).toHaveAttribute("data-tour-step", "navigation");
  await tour.getByRole("button", { name: "Indietro", exact: true }).click();
  await expect(tour).toHaveAttribute("data-tour-step", "create");
  await tour.getByRole("button", { name: "Salta tour", exact: true }).click();
  await expect.poll(async () => (await (await request.get("/api/tours")).json()).home).toBe(true);
  await page.reload(); await page.waitForTimeout(900);
  await expect(tour).toHaveCount(0);
  if (width === 390) await page.getByRole("navigation", { name: "Navigazione principale", exact: true }).getByRole("button", { name: "Account", exact: true }).click();
  else await page.getByRole("button", { name: "Apri menu account", exact: true }).click();
  await page.getByRole("menuitem", { name: "Account", exact: true }).click();
  const account = page.getByRole("dialog", { name: "Il tuo account", exact: true });
  await expect(account.getByRole("region", { name: "Tour di Tony", exact: true })).toBeVisible();
  await account.getByRole("button", { name: "Rifai tour Home", exact: true }).click();
  await expect(tour).toBeVisible();
  await finish(page, "Tour Home");
});

for (const width of [1280, 390]) test(`course and PDF tours are independent and wait for the rendered PDF at ${width}px`, async ({ page, request }) => {
  test.setTimeout(90000);
  await flags(request, { home: true, course: false, reader: false });
  await page.setViewportSize({ width, height: 900 });
  const folder = await (await request.post("/api/folders", { data: { name: `Tour ${Date.now()}` } })).json();
  const pdf = await PDFDocument.create(); pdf.addPage([600, 850]); pdf.addPage([600, 850]);
  const doc = await (await request.post("/api/documents", { multipart: { folderId: folder.id, file: { name: "Tour.pdf", mimeType: "application/pdf", buffer: Buffer.from(await pdf.save()) } } })).json();
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let fetching = false;
  try {
    await page.goto(`/esami/${folder.id}`);
    const course = page.getByRole("dialog", { name: "Tour Esame", exact: true });
    await expect(course).toBeVisible();
    await expect(course).toHaveAttribute("data-tour-step", "actions");
    await expect(page.locator('[data-tour-material-menu]')).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Escludi dalle statistiche", exact: true })).toBeVisible();
    await course.getByRole("button", { name: "Avanti", exact: true }).click();
    await expect(course).toHaveAttribute("data-tour-step", "read-pages");
    await expect(page.locator('[data-tour-highlight="read-pages"]')).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Segna pagine lette", exact: true })).toBeVisible();
    await course.getByRole("button", { name: "Avanti", exact: true }).click();
    await expect(course).toHaveAttribute("data-tour-step", "delete-file");
    await expect(page.getByRole("menuitem", { name: "Elimina file", exact: true })).toBeVisible();
    await page.screenshot({ path: `test-results/tony-course-menu-${width}.png` });
    await course.getByRole("button", { name: "Avanti", exact: true }).click();
    await expect(course).toHaveAttribute("data-tour-step", "open-file");
    await expect(page.locator('[data-tour-material-menu]')).toHaveCount(0);
    await page.route(`**/api/documents/${doc.id}/pdf`, async route => { fetching = true; await held; await route.continue(); });
    if (width === 390) await page.getByRole("button", { name: "Apri Tour", exact: true }).click();
    else await course.getByRole("button", { name: "Apri PDF", exact: true }).click();
    await expect.poll(() => fetching).toBe(true);
    await expect.poll(async () => (await (await request.get("/api/tours")).json()).course).toBe(true);
    await page.waitForTimeout(800);
    const reader = page.getByRole("dialog", { name: "Tour Lettore PDF", exact: true });
    await expect(reader).toHaveCount(0);
    expect((await (await request.get("/api/tours")).json()).reader).toBe(false);
    release();
    await expect(page.locator('.slide-stage .pdf-canvas[data-ready="true"] canvas')).toBeVisible();
    await expect(reader).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator('input[aria-label="Numero della slide"]')).toHaveValue("1");
    await page.screenshot({ path: `test-results/tony-reader-${width}.png` });
    await finish(page, "Tour Lettore PDF");
    await expect.poll(async () => (await (await request.get("/api/tours")).json()).reader).toBe(true);
    await page.reload(); await page.waitForTimeout(900);
    await expect(reader).toHaveCount(0);
    if (width === 1280) {
      for (const label of ["Esame", "Lettore PDF"]) {
        await page.goto("/");
        await page.getByRole("button", { name: "Apri menu account", exact: true }).click();
        await page.getByRole("menuitem", { name: "Account", exact: true }).click();
        await page.getByRole("dialog", { name: "Il tuo account", exact: true }).getByRole("button", { name: `Rifai tour ${label}`, exact: true }).click();
        const replay = page.getByRole("dialog", { name: `Tour ${label}`, exact: true });
        await expect(replay).toBeVisible();
        await replay.getByRole("button", { name: "Salta tour", exact: true }).click();
        await expect(replay).toHaveCount(0);
      }
    }
  } finally { release?.(); await request.delete(`/api/folders/${folder.id}`); }
});
