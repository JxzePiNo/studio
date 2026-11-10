import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { studyDay } from "../lib/study-session";

test("right-click merges selected timer sessions then deletes them without changing read activity", async ({ page, request }) => {
  const documentId = randomUUID();
  const day = studyDay();
  const before = await (await request.get(`/api/study-sessions?day=${day}`)).json();
  const first = randomUUID(); const second = randomUUID();
  for (const [id, start, end] of [[first, "10:00", "10:10"], [second, "10:05", "10:15"]]) {
    const result = await request.post("/api/study-sessions", { data: { type: "session", session: { id, startedAt: `${day}T${start}:00.000Z`, endedAt: `${day}T${end}:00.000Z`, day, durationMs: 600000, pages: [{ documentId, page: 1, name: `Ripasso ${documentId}.pdf` }] } } });
    expect(result.ok()).toBe(true);
  }
  await page.goto("/sessioni");
  const rows = page.locator("ol > li").filter({ hasText: `Ripasso ${documentId}.pdf` });
  await expect(rows).toHaveCount(2);
  await rows.nth(0).getByRole("checkbox").check();
  await rows.nth(1).getByRole("checkbox").check();
  await rows.nth(0).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Raggruppa selezionate", exact: true }).click();
  const merge = page.getByRole("dialog", { name: "Raggruppare le sessioni?", exact: true });
  await merge.getByRole("button", { name: "Raggruppa sessioni", exact: true }).click();
  await expect(merge).toHaveCount(0);
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText("15 min");
  await expect(rows).toContainText("2 sessioni raggruppate");
  await rows.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Elimina sessione", exact: true }).click();
  await page.getByRole("dialog", { name: "Eliminare le sessioni?", exact: true }).getByRole("button", { name: "Elimina sessioni", exact: true }).click();
  await expect(rows).toHaveCount(0);
  const after = await (await request.get(`/api/study-sessions?day=${day}`)).json();
  expect(after.activity).toEqual(before.activity);
});
