import { formatCourseName } from "../lib/course-name";
import { expect, test } from "@playwright/test";
import { studyDay } from "../lib/study-session";

test("exam home searches accents, sorts cards and opens all settings from one icon", async ({ page, request }) => {
  const marker = `Ricerca ${Date.now()}`;
  const folders: { id: string; name: string }[] = [];
  try {
    for (const [name, offset] of [[`ÀLGEBRA ${marker}`, 4], [`biologia ${marker}`, 2], [`ZOOLOGIA ${marker}`, 7]] as const) {
      const date = new Date(); date.setDate(date.getDate() + offset);
      const response = await request.post("/api/folders", { data: { name, examDate: studyDay(date) } });
      expect(response.status()).toBe(201);
      folders.push(await response.json());
    }
    await page.goto("/");
    await page.getByRole("searchbox", { name: "Cerca un esame", exact: true }).fill(marker);
    const cards = page.locator(".exam-overview-card");
    await expect(cards).toHaveCount(3);
    await expect(cards.first().getByRole("button", { name: `Apri esame ${folders[1].name}`, exact: true })).toBeVisible();
    await page.getByRole("combobox", { name: "Ordina esami", exact: true }).click();
    await page.getByRole("option", { name: "Nome A–Z", exact: true }).click();
    await expect(cards.first().getByRole("button", { name: `Apri esame ${folders[0].name}`, exact: true })).toBeVisible();
    await expect(cards.first().getByRole("heading", { level: 3 })).toHaveText(formatCourseName(folders[0].name));
    await expect(cards.first().getByRole("button")).toHaveCount(2);
    await expect(cards.first()).toContainText("Tra 4 giorni");
    await expect(cards.first()).not.toContainText(/\d+ materiali|\d+ pagine/);
    await cards.first().getByRole("button", { name: `Impostazioni ${folders[0].name}`, exact: true }).click();
    const settings = page.getByRole("dialog", { name: `Impostazioni ${formatCourseName(folders[0].name)}`, exact: true });
    await expect(settings.getByRole("button", { name: "Blu", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("searchbox", { name: "Cerca un esame", exact: true }).fill(`algebra ${marker}`);
    await expect(cards).toHaveCount(1);
    await page.getByRole("searchbox", { name: "Cerca un esame", exact: true }).fill("nessun-esame-trovabile-000000000");
    await expect(page.getByRole("heading", { name: "Nessun esame trovato", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Cancella ricerca", exact: true }).click();
    await expect(page.getByRole("searchbox", { name: "Cerca un esame", exact: true })).toHaveValue("");
    await page.getByRole("combobox", { name: "Ordina esami", exact: true }).click();
    await page.getByRole("option", { name: "Più recenti", exact: true }).click();
    await page.screenshot({ path: "test-results/exam-home-clean.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    const search = (await page.getByRole("searchbox", { name: "Cerca un esame", exact: true }).boundingBox())!;
    const sort = page.getByRole("combobox", { name: "Ordina esami", exact: true });
    const sortBox = (await sort.boundingBox())!;
    expect(Math.abs(search.y - sortBox.y)).toBeLessThan(2);
    expect(Math.abs(search.width / sortBox.width - 2)).toBeLessThan(0.05);
    await sort.click();
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.getByRole("option", { name: "Data più vicina", exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: "test-results/exam-home-clean-mobile.png" });
  } finally { for (const folder of folders) await request.delete(`/api/folders/${folder.id}`); }
});
