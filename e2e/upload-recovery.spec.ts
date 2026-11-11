import { expect, test } from "@playwright/test";
import { createExam } from "./exam-helpers";

test("an image can be uploaded and opened in the reader", async ({ page, request }) => {
  await page.goto("/");
  const folder = await createExam(page, "Appunti fotografati");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
  try {
    await page.getByLabel("Carica PDF o immagini", { exact: true }).setInputFiles({ name: "Appunti.png", mimeType: "image/png", buffer: png });
    await page.getByRole("button", { name: "Apri Appunti", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Appunti", exact: true })).toBeVisible();
    await expect(page.locator(".reader-navigation-page")).toContainText("/ 1");
    await expect(page.getByRole("button", { name: "Analizza questa pagina", exact: true })).toBeVisible();
  } finally { await request.delete(`/api/folders/${folder.id}`); }
});

test("single-page analysis retries temporary errors twice and then shows the explanation", async ({ page, request }) => {
  await page.route("**/api/status", route => route.fulfill({ json: { configured: true } }));
  await page.goto("/");
  const folder = await createExam(page, "Recupero automatico");
  let calls = 0;
  await page.route("**/api/documents/*/analyze", route => {
    if (++calls < 3) return route.fulfill({ status: 502, json: { error: "Errore temporaneo." } });
    return route.fulfill({ json: { notes: "", explanation: {
      title: "Analisi recuperata", language: "it", overview: "Una spiegazione dopo due errori temporanei.",
      concepts: [], example: "", takeaway: "", glossary: [],
    } } });
  });
  try {
    await page.getByLabel("Carica PDF o immagini", { exact: true }).setInputFiles("public/esempio.pdf");
    await page.getByRole("button", { name: "Apri esempio", exact: true }).click();
    await page.getByRole("button", { name: "Analizza questa pagina", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Analisi recuperata", exact: true })).toBeVisible({ timeout: 15000 });
    expect(calls).toBe(3);
    await expect(page.locator('.error-banner[role="alert"]')).toHaveCount(0);
  } finally { await request.delete(`/api/folders/${folder.id}`); }
});
