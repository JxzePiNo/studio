import { expect, test } from "@playwright/test";

test("the invitations section creates links and sends a greeting to an invited person", async ({ page }) => {
  const state = { available: true, links: [] as { code: string; label: string; count: number; createdAt: string }[], invitees: [{ id: "bob", name: "Bob", linkLabel: "Amici", joinedAt: new Date().toISOString(), greeting: undefined as { text: string; sentAt: string; readAt?: string } | undefined }] };
  await page.route("**/api/referrals", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: state });
    const body = route.request().postDataJSON();
    if (body.action === "create") state.links.push({ code: "a".repeat(24), label: body.label, count: 1, createdAt: new Date().toISOString() });
    if (body.action === "greet") { expect(body.recipientId).toBe("bob"); state.invitees[0].greeting = { text: body.text, sentAt: new Date().toISOString() }; }
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto("/inviti");
  await expect(page.getByRole("heading", { name: "Inviti e saluti", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Nome del link", exact: true }).fill("Compagni di corso");
  await page.getByRole("button", { name: "Crea link", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Link Compagni di corso", exact: true })).toHaveValue(/\?ref=aaaaaaaaaaaaaaaaaaaaaaaa$/);
  await page.getByRole("button", { name: "Manda un saluto", exact: true }).click();
  await page.getByRole("textbox", { name: "Il tuo saluto per Bob", exact: true }).fill("Ciao Bob, buon esame!");
  await page.getByRole("button", { name: "Invia saluto", exact: true }).click();
  await expect(page.getByText("Da leggere", { exact: true })).toBeVisible();
  await expect(page.getByText("Ciao Bob, buon esame!", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Manda un saluto", exact: true })).toHaveCount(0);
  state.invitees[0].greeting!.readAt = new Date().toISOString();
  await page.reload();
  await expect(page.getByText("Letto", { exact: true })).toBeVisible();
});

test("Tony welcomes invitees before their friend's message and profile questions", async ({ page }) => {
  let reads = 0;
  const greeting = { id: "00000000-0000-4000-8000-000000000001", fromName: "Iacopo Rossi", text: "Ciao, buon esame!", sentAt: new Date().toISOString() };
  await page.route("**/api/nicknames", route => route.fulfill({ json: { iacopo: "Pino" } }));
  await page.route("**/api/profile", route => route.fulfill({ json: { studyProgram: "", university: "", nickname: "", onboardingCompleted: false, updatedAt: "" } }));
  await page.route("**/api/referrals/greetings", route => route.fulfill({ json: { welcome: !reads, greeting: reads ? null : greeting } }));
  await page.route("**/api/referrals", route => { expect(route.request().postDataJSON()).toEqual({ action: "welcome-complete", greetingId: greeting.id }); reads++; return route.fulfill({ json: { completed: true } }); });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Benvenuto su studio." })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Cosa studi?" })).toHaveCount(0);
  await expect(page.getByText(greeting.text, { exact: true })).toHaveCount(0);
  expect(reads).toBe(0);
  await page.getByRole("button", { name: "Continua", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Un saluto da Pino." })).toBeVisible();
  await expect(page.getByText(greeting.text, { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Cosa studi?" })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/referral-welcome-mobile.png", animations: "disabled" });
  expect(reads).toBe(0);
  await page.getByRole("button", { name: "Continua", exact: true }).click();
  await expect.poll(() => reads).toBe(1);
  await expect(page.getByRole("dialog", { name: "Cosa studi?" })).toBeVisible();
  await page.screenshot({ path: "test-results/referral-onboarding-mobile.png", animations: "disabled" });
  await page.reload();
  await expect(page.getByRole("dialog", { name: "Cosa studi?" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Benvenuto su studio." })).toHaveCount(0);
  expect(reads).toBe(1);
});

test("a greeting uses a first name and stays unread after a failed confirmation", async ({ page }) => {
  let reads = 0;
  let attempts = 0;
  const greeting = { id: "00000000-0000-4000-8000-000000000002", fromName: "Alice Rossi", text: "Benvenuto!", sentAt: new Date().toISOString() };
  await page.route("**/api/referrals/greetings", route => route.fulfill({ json: { welcome: false, greeting: reads ? null : greeting } }));
  await page.route("**/api/referrals", route => {
    if (++attempts === 1) return route.fulfill({ status: 503, json: { error: "Riprova" } });
    reads++; return route.fulfill({ json: { completed: true } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Continua", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Un saluto da Alice." })).toBeVisible();
  await page.getByRole("button", { name: "Continua", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Non riesco a salvare il benvenuto");
  expect(reads).toBe(0);
  await page.reload();
  await page.getByRole("button", { name: "Continua", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Un saluto da Alice." })).toBeVisible();
  await page.getByRole("button", { name: "Continua", exact: true }).click();
  await expect.poll(() => reads).toBe(1);
  await expect(page.getByRole("heading", { name: "Un saluto da Alice." })).toHaveCount(0);
});

test("an invite without a personal greeting continues directly from Tony to the profile", async ({ page }) => {
  let completed = false;
  await page.route("**/api/profile", route => route.fulfill({ json: { studyProgram: "", university: "", nickname: "", onboardingCompleted: false, updatedAt: "" } }));
  await page.route("**/api/referrals/greetings", route => route.fulfill({ json: { welcome: !completed, greeting: null } }));
  await page.route("**/api/referrals", route => { expect(route.request().postDataJSON()).toEqual({ action: "welcome-complete" }); completed = true; return route.fulfill({ json: { completed: true } }); });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Benvenuto su studio." })).toBeVisible();
  await page.getByRole("button", { name: "Continua", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Cosa studi?" })).toBeVisible();
});
