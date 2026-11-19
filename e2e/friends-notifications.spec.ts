import { expect, test } from "@playwright/test";

for (const width of [1280, 390]) test(`friend requests preview and online indicator update at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  let online = true;
  let pending = true;
  const responses: unknown[] = [];
  const friend = { id: "bob", name: "Bob", nickname: "bob", university: "Roma", studyProgram: "Informatica", status: "offline", lastSeen: Date.now() - 3 * 86400000 };
  const incoming = { ...friend, id: "alice", name: "Alice", nickname: "alice" };
  await page.route("**/api/friends**", route => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      if (body.action === "relationship") {
        responses.push(body);
        pending = false;
      }
      return route.fulfill({ json: { ok: true } });
    }
    if (new URL(route.request().url()).searchParams.has("activity")) return route.fulfill({ json: { enabled: true, online: online ? [{ ...friend, status: "online" }] : [], studying: [], incoming: pending ? 1 : 0, incomingRequest: pending ? incoming : undefined } });
    return route.fulfill({ json: { available: true, self: { enabled: true, shareActivity: true, discoverable: true, name: "Me", nickname: "me", university: "Roma" }, friends: [friend], incoming: pending ? [incoming] : [], outgoing: [], leaderboard: [], period: "day" } });
  });
  await page.goto("/");
  const notifications = page.getByRole("dialog", { name: "Notifiche", exact: true });
  const request = page.getByRole("article", { name: "Richiesta di amicizia di Alice" });
  await expect(request).toBeVisible();
  await expect(request.getByRole("button", { name: "Accetta richiesta di Alice" })).toBeVisible();
  await expect(request.getByRole("button", { name: "Rifiuta richiesta di Alice" })).toBeVisible();
  await expect(notifications).toHaveCount(0);
  const people = page.getByRole("button", { name: /^Amici online:/ });
  await expect(people.locator("i")).toBeVisible();
  online = false;
  await page.evaluate(() => window.dispatchEvent(new Event("studio-friends-changed")));
  await expect(people.locator("i")).toHaveCount(0);
  await expect(notifications).toHaveCount(0);
  const operation = width === 1280 ? "accept" : "reject";
  if (operation === "reject") await page.getByRole("button", { name: /^Mostra notifiche/ }).click();
  await page.getByRole("button", { name: operation === "accept" ? "Accetta richiesta di Alice" : "Rifiuta richiesta di Alice", exact: true }).click();
  await expect(request).toHaveCount(0);
  expect(responses).toEqual([{ action: "relationship", operation, targetId: "alice" }]);
  if (operation === "reject") await notifications.getByRole("button", { name: "Chiudi notifiche" }).click();
  await expect(people).toHaveAccessibleName("Amici online: 0 online, 0 richieste");
});
