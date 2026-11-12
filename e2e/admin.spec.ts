import { expect, test } from "@playwright/test";
import { defaultPlatform } from "../lib/platform-config";

test("empty notifications open a useful state and account footer stays on one row", async ({ page }) => {
  await page.goto("/");
  const bell = page.getByRole("button", { name: "Mostra notifiche", exact: true });
  await bell.click();
  await expect(page.getByRole("dialog", { name: "Notifiche", exact: true })).toContainText("Nessuna notifica qui.");
  await page.getByRole("button", { name: "Chiudi notifiche", exact: true }).click();
  await expect(page.getByRole("region", { name: "Notifiche", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Apri menu account", exact: true }).click();
  await page.getByRole("menuitem", { name: "Account", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Il tuo account", exact: true });
  const close = (await dialog.getByRole("button", { name: "Chiudi", exact: true }).boundingBox())!, save = (await dialog.getByRole("button", { name: "Salva profilo", exact: true }).boundingBox())!;
  expect((await dialog.boundingBox())!.width).toBeGreaterThanOrEqual(600);
  expect(Math.abs(close.y - save.y)).toBeLessThan(2); expect(save.width).toBeGreaterThan(close.width * 2);
  await page.screenshot({ path: "test-results/account-wide-footer.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("navigation", { name: "Navigazione principale", exact: true }).getByRole("button", { name: "Account", exact: true }).click();
  await page.getByRole("menuitem", { name: "Account", exact: true }).click();
  const mobileClose = (await dialog.getByRole("button", { name: "Chiudi", exact: true }).boundingBox())!, mobileSave = (await dialog.getByRole("button", { name: "Salva profilo", exact: true }).boundingBox())!;
  expect(Math.abs(mobileClose.y - mobileSave.y)).toBeLessThan(2);
});

test("admin dashboard handles user detail, platform settings and nickname management", async ({ page }) => {
  const uid = "user-test", at = "2026-11-11T12:00:00.000Z", user = { uid, name: "Utente esempio", email: "utente@example.com", disabled: false, verified: true, createdAt: at, lastLoginAt: at, lastVisitAt: "2026-11-12T14:15:00.000Z" };
  const usage = { models: { mini: { model: "gpt-4.1-mini", input: 1000, cached: 200, output: 300, total: 1300, calls: 1, unknown: 0 } }, calls: 1, errors: 0, firstRecordedAt: at, lastRecordedAt: at };
  let config = structuredClone(defaultPlatform), savedControls = false;
  await page.route("**/api/admin", async route => {
    if (route.request().method() === "PATCH") { config = route.request().postDataJSON(); return route.fulfill({ json: config }); }
    return route.fulfill({ json: { users: [{ ...user, usage, files: { count: 2, bytes: 1024, pages: 10 }, activity: { questions: 3 } }], cursor: null, config, audit: [], generatedAt: at } });
  });
  await page.route(`**/api/admin/users/${uid}`, route => {
    if (route.request().method() === "PATCH") { expect(route.request().postDataJSON().action).toBe("controls"); savedControls = true; return route.fulfill({ json: { ok: true } }); }
    return route.fulfill({ json: { uid, user, profile: { studyProgram: "Medicina" }, controls: {}, usage, documents: [], folders: [], questions: [{ id: "q1", at, kind: "chat", page: 1, question: "Come funziona il cuore?", documentId: "doc1" }], events: [], sessions: [], referral: null } });
  });
  await page.route("**/api/nicknames", route => route.fulfill({ json: { iacopo: "Pino" } }));
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Utenti", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Amministrazione", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Apri menu account", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Torna a Studio", exact: true })).toHaveAttribute("href", "/");
  await page.getByRole("menuitemcheckbox", { name: /Modalità notte/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Apri menu account", exact: true }).click();
  await page.getByRole("menuitemcheckbox", { name: /Modalità notte/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("button", { name: "Apri menu account", exact: true })).toBeInViewport();
  await expect(page.locator('main > div').first()).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await page.screenshot({ path: "test-results/admin-users.png" });
  await expect(page.getByRole("columnheader", { name: "Ultima visita", exact: true })).toBeVisible();
  const expectedVisit = await page.evaluate(value => new Date(value).toLocaleString("it-IT"), user.lastVisitAt);
  await expect(page.getByRole("row").filter({ hasText: user.email }).getByRole("cell").nth(2)).toHaveText(expectedVisit);
  await page.getByRole("button", { name: "Gestisci", exact: true }).click();
  const detail = page.getByRole("region", { name: "Dettaglio utente" });
  await expect(detail).toContainText("Medicina"); await expect(detail).toContainText("Tariffa non configurata");
  await detail.getByLabel("Blocca tutte le generazioni AI").check();
  await detail.getByRole("button", { name: "Salva controlli utente", exact: true }).click();
  await expect.poll(() => savedControls).toBe(true);
  await page.getByRole("button", { name: "Piattaforma", exact: true }).click();
  await page.getByLabel("Modalità manutenzione").check();
  await page.getByLabel("Immagini", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Salva impostazioni piattaforma", exact: true }).click();
  await expect.poll(() => config.maintenance).toBe(true); expect(config.features.images).toBe(false);
  await page.screenshot({ path: "test-results/admin-platform.png" });
  await page.getByRole("button", { name: "Soprannomi", exact: true }).click();
  await expect(page.getByRole("region", { name: "Gestione soprannomi", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Apri menu", exact: true }).click();
  await expect(page.getByRole("button", { name: "Apri menu account", exact: true })).toBeInViewport();
  await page.getByRole("navigation", { name: "Sezioni amministrazione" }).getByRole("button", { name: "Registro admin", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Registro operazioni admin" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Chiudi menu", exact: true })).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("admin API remains denied in local mode even when UI is directly reachable", async ({ page, request }) => {
  expect((await request.get("/api/admin")).status()).toBe(403);
  expect((await request.get("/api/admin/costs")).status()).toBe(403);
  await page.goto("/admin");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("account amministratore");
  await expect(page.getByRole("button", { name: "Salva impostazioni piattaforma" })).toHaveCount(0);
});

test("admin costs retain provider currencies, period selection and independent setup states", async ({ page }) => {
  const at = "2026-11-12T12:00:00.000Z";
  await page.route("**/api/admin", route => route.fulfill({ json: { users: [], cursor: null, config: defaultPlatform, audit: [], generatedAt: at } }));
  let period = "30";
  await page.route("**/api/admin/costs?*", route => {
    period = new URL(route.request().url()).searchParams.get("days")!;
    return route.fulfill({ json: { start: "2026-10-14T00:00:00.000Z", end: at, openai: { status: "ready", source: "OpenAI Costs API", scope: "Progetto OpenAI Studio", message: "", updatedAt: at, entries: [{ day: "2026-11-12", service: "Modelli AI", currency: "USD", amount: 12.5 }, { day: "2026-11-11", service: "Modelli AI", currency: "USD", amount: 2 }] }, firebase: period === "7" ? { status: "setup", source: "Google Cloud Billing · BigQuery", scope: "Progetto Firebase", message: "Collega l'esportazione di Google Cloud Billing in BigQuery", updatedAt: null, entries: [] } : { status: "ready", source: "Google Cloud Billing · BigQuery", scope: "Progetto Firebase Studio", message: "", updatedAt: at, entries: [{ day: "2026-11-12", service: "Cloud Firestore", currency: "EUR", amount: 0.75 }] } } });
  });
  await page.goto("/admin");
  await page.getByRole("button", { name: "Costi", exact: true }).click();
  const openai = page.getByRole("region", { name: "Costi OpenAI", exact: true }), firebase = page.getByRole("region", { name: "Costi Firebase", exact: true });
  await expect(openai).toContainText("14,50"); await expect(firebase).toContainText("0,75");
  await page.screenshot({ path: "test-results/admin-costs.png" });
  await page.getByRole("combobox", { name: "Periodo", exact: true }).selectOption("7");
  await expect.poll(() => period).toBe("7");
  await expect(firebase).toContainText("Da collegare"); await expect(openai).toContainText("14,50");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
