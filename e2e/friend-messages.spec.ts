import { expect, test } from "@playwright/test";

for (const width of [1280, 390]) test(`online friends exchange messages with an open notification at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const bob = { id: "bob", name: "Bob Rossi", nickname: "bob", university: "Roma", studyProgram: "Fisica", status: "online" };
  let incoming: { id: string; sender: typeof bob; text: string; sentAt: number }[] = [];
  const sent: unknown[] = [];
  await page.route("**/api/friends**", route => {
    if (route.request().method() === "POST") return route.fulfill({ json: { ok: true } });
    if (new URL(route.request().url()).searchParams.has("activity")) return route.fulfill({ json: { enabled: true, online: [bob], studying: [], incoming: 0 } });
    return route.fulfill({ json: { available: true, self: { name: "Alice", nickname: "alice", shareActivity: true, discoverable: true }, friends: [bob], incoming: [], outgoing: [], leaderboard: [], period: "day" } });
  });
  await page.route("**/api/friend-messages", route => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      if (body.action === "send") sent.push(body);
      else incoming = incoming.filter(message => !body.ids.includes(message.id));
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: { messages: incoming } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /^Amici online:/ }).click();
  await page.getByRole("button", { name: "Scrivi a bob", exact: true }).click();
  const composer = page.getByRole("dialog", { name: "Messaggio a @bob", exact: true });
  await composer.getByRole("textbox", { name: "Messaggio", exact: true }).fill("Ci sei per ripassare?");
  await composer.getByRole("button", { name: "Invia messaggio", exact: true }).click();
  await expect(composer.getByRole("status")).toHaveText("Messaggio inviato.");
  expect(sent[0]).toMatchObject({ action: "send", targetId: "bob", text: "Ci sei per ripassare?" });
  expect(sent[0]).not.toHaveProperty("senderId");
  await composer.getByRole("button", { name: "Chiudi", exact: true }).click();
  incoming = [{ id: crypto.randomUUID(), sender: bob, text: "Certo, iniziamo da Analisi!", sentAt: Date.now() }];
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  const notifications = page.getByRole("dialog", { name: "Notifiche", exact: true });
  await expect(notifications).toBeVisible();
  await expect(notifications).toContainText("@bob");
  await expect(notifications).toContainText("Certo, iniziamo da Analisi!");
  await page.screenshot({ path: `test-results/friend-message-${width}.png` });
  await notifications.getByRole("button", { name: "Rispondi", exact: true }).click();
  await expect(composer).toBeVisible();
  await expect(notifications).toHaveCount(0);
  await composer.getByRole("button", { name: "Chiudi", exact: true }).click();
  await expect.poll(() => incoming.length).toBe(0);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(notifications).toHaveCount(0);
});
