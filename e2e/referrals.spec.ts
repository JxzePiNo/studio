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

test("changing screen cancels the greeting read timer and Tony presents the unread greeting again", async ({ page }) => {
  await page.clock.install();
  let reads = 0;
  const greeting = { id: "00000000-0000-4000-8000-000000000001", fromName: "Alice", text: "Ciao!", sentAt: new Date().toISOString() };
  await page.route("**/api/referrals/greetings", route => route.fulfill({ json: { greeting: reads ? null : greeting } }));
  await page.route("**/api/referrals", route => { reads++; return route.fulfill({ json: { read: true } }); });
  await page.goto("/");
  await page.bringToFront();
  const chat = page.getByRole("region", { name: "Un saluto da Tony", exact: true });
  await expect(chat).toContainText("Alice");
  await page.clock.runFor(100);
  await page.clock.fastForward(6000);
  expect(reads).toBe(0);
  await page.getByRole("button", { name: "Sessioni di studio", exact: true }).click();
  await expect(chat).toBeVisible();
  await page.clock.runFor(100);
  await page.clock.fastForward(3000);
  expect(reads).toBe(0);
  await page.clock.fastForward(6000);
  await expect.poll(() => reads).toBe(1);
  await expect(chat).toBeHidden();
  await page.reload();
  await expect(chat).toBeHidden();
  expect(reads).toBe(1);
});

test("a deferred or background greeting remains unread until the recipient confirms reading", async ({ page }) => {
  await page.clock.install();
  let reads = 0;
  const greeting = { id: "00000000-0000-4000-8000-000000000002", fromName: "Alice", text: "Benvenuto!", sentAt: new Date().toISOString() };
  await page.route("**/api/referrals/greetings", route => route.fulfill({ json: { greeting: reads ? null : greeting } }));
  await page.route("**/api/referrals", route => { reads++; return route.fulfill({ json: { read: true } }); });
  await page.goto("/");
  const chat = page.getByRole("region", { name: "Un saluto da Tony", exact: true });
  await expect(chat).toBeVisible();
  await chat.getByRole("button", { name: "Leggi più tardi", exact: true }).click();
  await page.clock.fastForward(20000);
  expect(reads).toBe(0);
  await page.getByRole("button", { name: "Sessioni di studio", exact: true }).click();
  await expect(chat).toBeVisible();
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
  await page.clock.fastForward(20000);
  expect(reads).toBe(0);
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }); document.dispatchEvent(new Event("visibilitychange")); });
  await chat.getByRole("button", { name: "Ho letto", exact: true }).click();
  await expect.poll(() => reads).toBe(1);
  await expect(chat).toBeHidden();
});
