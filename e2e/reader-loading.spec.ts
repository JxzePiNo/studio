import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("reader appears before the PDF arrives, with Tony and rotating barista actions", async ({ page, request }) => {
  test.setTimeout(60000);
  const exam = await (await request.post("/api/folders", { data: { name: `Tony al bar ${Date.now()}` } })).json();
  const uploaded = await request.post("/api/documents", { multipart: { folderId: exam.id, file: { name: "Barista.pdf", mimeType: "application/pdf", buffer: await readFile("public/esempio.pdf") } } });
  expect(uploaded.status()).toBe(201);
  const document = await uploaded.json();
  await page.goto(`/esami/${exam.id}`, { waitUntil: "domcontentloaded" });
  let release!: () => void;
  let started = false;
  let finish = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/api/documents/${document.id}/pdf`, async route => { started = true; await held; await route.continue(); });
  try {
    await page.getByRole("button", { name: "Apri Barista", exact: true }).click();
    await expect(page).toHaveURL(`/esami/${exam.id}/documenti/${document.id}`);
    await expect(page.locator(".reader-active .slide-stage")).toBeVisible();
    const loading = page.locator('.slide-stage [data-loading="tony"]');
    await expect(loading).toBeVisible();
    await expect(loading).toHaveAttribute("aria-busy", "true");
    const chat = page.getByRole("complementary", { name: "Tutor della slide", exact: true });
    const skeleton = chat.getByRole("status", { name: "Caricamento della chat in corso.", exact: true });
    await expect(skeleton).toBeVisible();
    const placeholders = skeleton.locator('[data-slot="skeleton"]');
    await expect(placeholders.first()).toHaveCSS("animation-name", "ui-skeleton-pulse");
    expect(await skeleton.locator('[aria-hidden="true"]').evaluate(element => element.getAnimations({ subtree: true }).some(animation => animation.playState === "running"))).toBe(true);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(placeholders.first()).toHaveCSS("animation-name", "none");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect.poll(() => started).toBe(true);
    await expect(loading.locator('p[aria-hidden="true"]')).not.toBeEmpty();
    await page.screenshot({ path: "test-results/barista-loading.png" });
    release();
    await expect(page.locator(".slide-stage canvas")).toBeVisible();
    await expect(skeleton).toHaveCount(0);
    for (const theme of ["light", "dark"]) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      for (const name of ["Pulisci schermata", "Crea materiale"]) {
        const button = page.getByRole("button", { name, exact: true });
        const accent = await button.evaluate(element => {
          const sample = document.createElement("span"); sample.style.backgroundColor = "var(--accent)"; element.append(sample);
          const color = getComputedStyle(sample).backgroundColor; sample.remove(); return color;
        });
        await button.hover();
        await expect(button).toHaveCSS("background-color", accent);
      }
    }
    await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
    await expect(page.getByText("Tony sta aprendo il PDF.", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Torna alla biblioteca", exact: true }).click();
    // Cancelling an opening must not later reopen the PDF when its response arrives.
    await page.unroute(`**/api/documents/${document.id}/pdf`);
    const waiting = new Promise<void>(resolve => { finish = resolve; });
    await page.route(`**/api/documents/${document.id}`, async route => { await waiting; await route.continue().catch(() => {}); });
    await page.getByRole("button", { name: "Apri Barista", exact: true }).click();
    await expect(page.getByText("Tony sta aprendo il PDF.", { exact: true })).toBeAttached();
    await page.goBack();
    await expect(page.locator(".materials-list")).toBeVisible();
    finish();
    await expect(page).toHaveURL(`/esami/${exam.id}`);
  } finally { release(); finish(); await page.unrouteAll({ behavior: "ignoreErrors" }); await request.delete(`/api/documents/${document.id}`, { timeout: 5000 }); await request.delete(`/api/folders/${exam.id}`, { timeout: 5000 }); }
});
