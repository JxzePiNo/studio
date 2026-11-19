import { expect, test } from "@playwright/test";

for (const width of [1280, 390]) test(`friend requests preview and online indicator update at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  let online = true;
  const friend = { id: "bob", name: "Bob", nickname: "bob", university: "Roma", studyProgram: "Informatica", status: "offline", lastSeen: Date.now() - 3 * 86400000 };
  const incoming = { ...friend, id: "alice", name: "Alice", nickname: "alice" };
  await page.route("**/api/friends**", route => {
    if (route.request().method() === "POST") return route.fulfill({ json: { ok: true } });
    if (new URL(route.request().url()).searchParams.has("activity")) return route.fulfill({ json: { enabled: true, online: online ? [{ ...friend, status: "online" }] : [], studying: [], incoming: 1 } });
    return route.fulfill({ json: { available: true, self: { enabled: true, shareActivity: true, discoverable: true, name: "Me", nickname: "me", university: "Roma" }, friends: [friend], incoming: [incoming], outgoing: [], leaderboard: [], period: "day" } });
  });
  await page.goto("/");
  const notifications = page.getByRole("dialog", { name: "Notifiche", exact: true });
  await expect(page.getByRole("button", { name: /1 richiesta di amicizia ricevuta/ })).toBeVisible();
  await expect(notifications).toHaveCount(0);
  const people = page.getByRole("button", { name: /^Amici online:/ });
  await expect(people.locator("i")).toBeVisible();
  online = false;
  await page.evaluate(() => window.dispatchEvent(new Event("studio-friends-changed")));
  await expect(people.locator("i")).toHaveCount(0);
  await expect(notifications).toHaveCount(0);
  await page.getByRole("button", { name: /^Mostra notifiche/ }).click();
  await notifications.getByRole("button", { name: /Apri richieste/ }).click();
  await expect(page.getByRole("button", { name: "Accetta richiesta di Alice", exact: true })).toBeVisible();
  await expect(page.getByText("Online 3gg fa", { exact: true }).first()).toBeVisible();
});
