import { test, expect } from "@playwright/test";

for (const width of [1280, 390]) test(`sidebar chats support offline friends, compact notifications and replies at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const bob = { id: "bob", name: "Bob Rossi", nickname: "bob", university: "Roma", studyProgram: "Fisica", status: "offline" };
  let incoming: { id: string; sender: typeof bob; text: string; sentAt: number }[] = [];
  const history: { id: string; text: string; sentAt: number; outgoing: boolean; read: boolean }[] = [];
  const sent: Record<string, unknown>[] = [];
  await page.route("**/api/friends**", route => {
    if (route.request().method() === "POST") return route.fulfill({ json: { ok: true } });
    if (new URL(route.request().url()).searchParams.has("activity")) return route.fulfill({ json: { enabled: true, online: [], studying: [], incoming: 0 } });
    return route.fulfill({ json: { available: true, self: { name: "Alice", nickname: "alice", shareActivity: true, discoverable: true }, friends: [bob], incoming: [], outgoing: [], leaderboard: [], period: "day" } });
  });
  await page.route("**/api/friend-messages**", route => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      if (body.action === "send") {
        sent.push(body);
        history.push({ id: body.id, text: body.text, sentAt: Date.now(), outgoing: true, read: false });
      } else {
        incoming = incoming.filter(message => !body.ids.includes(message.id));
        history.forEach(message => { if (body.ids.includes(message.id)) message.read = true; });
      }
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: { messages: new URL(route.request().url()).searchParams.has("friend") ? history : incoming } });
  });
  await page.goto("/");
  await expect(page.locator(".mobile-bottom-navigation").getByRole("button", { name: "Chat", exact: true })).toHaveCount(0);
  if (width < 700) await page.getByRole("button", { name: "Apri menu", exact: true }).click();
  await page.getByRole("navigation", { name: "Messaggi", exact: true }).getByRole("button", { name: "Chat", exact: true }).click();
  await expect(page).toHaveURL(/\/chat$/);
  await page.getByRole("complementary", { name: "Chat con gli amici" }).getByRole("button", { name: /@bob/ }).click();
  const chat = page.getByRole("region", { name: "Chat con bob", exact: true });
  await expect(chat).toBeVisible();
  await expect(chat).toContainText("Ultimo accesso non disponibile");
  await chat.getByRole("textbox", { name: "Messaggio", exact: true }).fill("Ci sei per ripassare?");
  await chat.getByRole("button", { name: "Invia", exact: true }).click();
  await expect(chat.getByRole("log")).toContainText("Ci sei per ripassare?");
  expect(sent[0]).toMatchObject({ action: "send", targetId: "bob", text: "Ci sei per ripassare?" });
  expect(sent[0]).not.toHaveProperty("senderId");
  await page.reload();
  await expect(chat.getByRole("log")).toContainText("Ci sei per ripassare?");
  await page.getByRole("button", { name: "Torna alla home", exact: true }).click();
  const received = { id: crypto.randomUUID(), sender: bob, text: "Certo, iniziamo da Analisi!", sentAt: Date.now() };
  incoming = [received];
  history.push({ id: received.id, text: received.text, sentAt: received.sentAt, outgoing: false, read: false });
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  const notifications = page.getByRole("dialog", { name: "Notifiche", exact: true });
  await expect(notifications).toBeVisible();
  const message = notifications.getByRole("article", { name: "Messaggio da bob" });
  await expect(message).toContainText("Certo, iniziamo da Analisi!");
  const dimensions = await message.evaluate(element => {
    const reply = element.querySelector('button[aria-label="Rispondi"]')!;
    const header = element.querySelector("header")!;
    return { height: element.getBoundingClientRect().height, replyInHeader: header.contains(reply), bottomPadding: getComputedStyle(element).paddingBottom };
  });
  expect(dimensions.replyInHeader).toBe(true);
  expect(dimensions.bottomPadding).toBe("10px");
  expect(dimensions.height).toBeLessThan(130);
  await page.screenshot({ path: `test-results/friend-message-${width}.png` });
  await message.getByRole("button", { name: "Rispondi", exact: true }).click();
  await expect(notifications).toHaveCount(0);
  await expect(chat).toBeVisible();
  await expect(chat.getByRole("log")).toContainText(received.text);
  await expect.poll(() => incoming.length).toBe(0);
  await chat.getByRole("textbox", { name: "Messaggio", exact: true }).fill("Perfetto, a dopo!");
  await chat.getByRole("button", { name: "Invia", exact: true }).click();
  await expect(chat.getByRole("log")).toContainText("Perfetto, a dopo!");
  await page.screenshot({ path: `test-results/friend-chat-${width}.png` });
  await page.goBack();
  await expect(page).not.toHaveURL(/\/chat/);
});
