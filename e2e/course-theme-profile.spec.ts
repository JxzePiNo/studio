import { test, expect } from "@playwright/test";
import { createExam } from "./exam-helpers";

test("il colore del corso, lo sfondo e il ritorno alla home seguono la navigazione", async ({ page, request }) => {
  await page.goto("/");
  const folder = await createExam(page, "Palette");
  await expect(page.locator(".main-shell")).toHaveAttribute("data-course-theme", "true");
  await expect(page.locator(".course-ambient")).toBeVisible();
  await expect(page.locator(".course-ambient rect")).not.toHaveCount(0);
  const tiles = await page.evaluate(async () => {
    const reference = new DOMParser().parseFromString(await (await fetch("/workspace-ambient.svg")).text(), "image/svg+xml");
    const opacity = (root: ParentNode) => [...root.querySelectorAll("rect")].map(rect => Math.round(Number(rect.getAttribute("opacity")) * 1000) / 1000);
    return { home: opacity(reference), course: opacity(document.querySelector(".course-ambient")!) };
  });
  expect(tiles.course).toEqual(tiles.home);
  await expect(page.locator(".course-ambient")).toHaveCSS("opacity", "0.42");
  const colors = await page.evaluate(() => {
    const root = getComputedStyle(document.querySelector(".main-shell")!);
    const swatch = document.createElement("span");
    swatch.style.color = root.getPropertyValue("--course-color");
    document.body.append(swatch);
    const expected = getComputedStyle(swatch).color;
    swatch.remove();
    return { expected, actual: getComputedStyle(document.querySelector(".course-ambient")!).color };
  });
  expect(colors.actual).toBe(colors.expected);
  await expect(page.getByRole("button", { name: "Scegli i PDF", exact: true })).toHaveCSS("background-color", colors.expected);
  await expect(page.locator(".studio-brand > span")).toHaveCSS("color", "rgb(26, 86, 219)");
  await page.getByRole("button", { name: "Apri menu account" }).click();
  await page.getByRole("menuitem", { name: "Account", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Il tuo account" }).getByRole("button", { name: "Salva profilo", exact: true })).toHaveCSS("background-color", "rgb(26, 86, 219)");
  await page.getByRole("button", { name: "Chiudi", exact: true }).click();
  await expect(page.locator(".materials-card")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await page.screenshot({ path: "test-results/course-theme-review.png", fullPage: true });
  for (const color of ["mint", "sky"]) {
    expect((await request.patch(`/api/folders/${folder.id}`, { data: { color } })).ok()).toBe(true);
    await page.reload();
    await expect(page.locator(".course-ambient")).toBeVisible();
    await page.screenshot({ path: `test-results/course-theme-${color}.png`, fullPage: true });
  }
  const back = page.getByRole("button", { name: "Torna alla home", exact: true });
  await expect(back).toHaveCSS("top", "8px");
  await back.click();
  await expect(page.locator(".main-shell")).not.toHaveAttribute("data-course-theme");
  await page.getByRole("button", { name: "Sessioni di studio", exact: true }).click();
  await expect(back).toBeVisible();
  await back.click();
  await expect(page).toHaveURL(/\/$/);
});

test("il nome dell'account rimane salvato e aggiorna il saluto", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Apri menu account" }).click();
  await page.getByRole("menuitem", { name: "Account", exact: true }).click();
  await page.getByRole("button", { name: "Modifica nome e cognome" }).click();
  await page.getByRole("textbox", { name: "Nome e cognome", exact: true }).fill("Tony Tester");
  await page.getByRole("button", { name: "Salva profilo", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Profilo salvato");
  await page.getByRole("button", { name: "Chiudi", exact: true }).click();
  await expect(page.getByRole("heading", { name: "I tuoi esami", exact: true })).toContainText("Ciao Tony");
  await page.reload();
  await expect(page.getByRole("heading", { name: "I tuoi esami", exact: true })).toContainText("Ciao Tony");
  await page.getByRole("button", { name: "Apri menu account" }).click();
  await page.getByRole("menuitem", { name: "Aiuto e guide" }).click();
  await expect(page.getByRole("dialog", { name: "Cosa vuoi fare?" }).locator('img[src="/lifebuoy.png"]')).toBeVisible();
});
