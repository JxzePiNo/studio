import { formatCourseName } from "../lib/course-name";
import { expect, type Page } from "@playwright/test";

export async function createExam(page: Page, prefix = "Esame di prova") {
  const name = `${prefix} ${Date.now()}`;
  await page.getByRole("button", { name: "Crea esame", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Nuovo esame", exact: true })).toBeVisible();
  await expect(page.locator(".folder-create")).toHaveCount(0);
  await page.getByRole("textbox", { name: "Nome esame" }).fill(name);
  const created = page.waitForResponse(r => r.url().endsWith("/api/folders") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Crea", exact: true }).click();
  const response = await created;
  expect(response.status()).toBe(201);
  const folder = await response.json() as { id: string; color: string };
  await expect(page.getByRole("dialog", { name: "Nuovo esame", exact: true })).toHaveCount(0);
  const menu = page.getByRole("button", { name: "Apri menu", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.locator(".sidebar:visible .folder-item").filter({ hasText: formatCourseName(name) }).click();
  await expect(page.locator(".selected-exam")).toContainText(formatCourseName(name));
  return { ...folder, name };
}

export function calendarDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export async function chooseCalendarDate(page: Page, date: string) {
  const calendar = page.locator('[data-slot="calendar"]:visible');
  await expect(calendar).toBeVisible();
  const day = calendar.locator(`[data-day="${date}"] button`);
  for (let month = 0; month < 24; month++) {
    if (await day.count()) { await day.click(); return; }
    await calendar.getByRole("button", { name: "Vai al mese successivo", exact: true }).click();
  }
  throw new Error(`Data ${date} non trovata nel calendario.`);
}
