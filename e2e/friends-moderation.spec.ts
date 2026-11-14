import { expect, test } from "@playwright/test";
import type { FriendsOverview } from "../lib/friends-types";

test("user menu reports, removes, blocks and unblocks friends on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const people = ["Bob", "Carol", "Dave"].map(name => ({ id: name.toLowerCase(), name, nickname: name.toLowerCase(), studyProgram: "Informatica", university: "Roma" }));
  const state: FriendsOverview = { available: true, self: { enabled: true, discoverable: true, shareActivity: true, name: "Alice", nickname: "alice", university: "Roma" }, friends: [...people], incoming: [], outgoing: [], blocked: [], leaderboard: [], period: "day" };
  const mutations: Record<string, unknown>[] = [];
  await page.route("**/api/friends**", route => {
    const url = new URL(route.request().url());
    if (route.request().method() === "POST") {
      const input = route.request().postDataJSON(); mutations.push(input);
      if (input.action === "relationship" && input.operation === "remove") state.friends = state.friends.filter(person => person.id !== input.targetId);
      if (input.action === "block") {
        if (input.blocked) { state.blocked!.push(people.find(person => person.id === input.targetId)!); state.friends = state.friends.filter(person => person.id !== input.targetId); }
        else state.blocked = state.blocked!.filter(person => person.id !== input.targetId);
      }
      return route.fulfill({ json: { ok: true } });
    }
    if (url.searchParams.has("activity")) return route.fulfill({ json: { enabled: false, studying: [], online: [], incoming: 0 } });
    if (url.searchParams.has("search")) return route.fulfill({ json: { people: [], truncated: false } });
    return route.fulfill({ json: state });
  });
  await page.goto("/amici", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Azioni per Bob", exact: true }).click();
  await page.getByRole("menuitem", { name: "Segnala utente", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Segnala utente", exact: true });
  await dialog.getByRole("combobox", { name: "Motivo", exact: true }).click();
  await page.getByRole("option", { name: "Molestie o comportamenti offensivi", exact: true }).click();
  await dialog.getByLabel("Dettagli (facoltativi)").fill("Comportamento offensivo");
  await dialog.getByRole("button", { name: "Segnala utente", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(mutations).toContainEqual({ action: "report", targetId: "bob", reason: "harassment", details: "Comportamento offensivo" });
  await page.getByRole("button", { name: "Azioni per Bob", exact: true }).click();
  await page.getByRole("menuitem", { name: "Rimuovi amico", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Rimuovi amico", exact: true });
  await dialog.getByRole("button", { name: "Rimuovi amico", exact: true }).click();
  await expect(page.getByRole("button", { name: "Azioni per Bob", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Azioni per Carol", exact: true }).click();
  await page.getByRole("menuitem", { name: "Blocca utente", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Blocca utente", exact: true });
  await dialog.getByRole("button", { name: "Blocca utente", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Azioni per Carol", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Impostazioni amici", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Utenti bloccati", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sblocca", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Utenti bloccati", exact: true })).toHaveCount(0);
  expect(mutations).toContainEqual({ action: "block", targetId: "carol", blocked: false });
});
