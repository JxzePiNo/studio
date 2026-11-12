import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { heartMap } from "../lib/artifact-example";

for (const width of [1280, 390]) test(`scope below choices and optional chips customize generation at ${width}px`, async ({ page, request }) => {
  await page.setViewportSize({ width, height: 844 });
  await page.route("**/api/status", route => route.fulfill({ json: { configured: true } }));
  const folder = await (await request.post("/api/folders", { data: { name: `Guida mappe ${Date.now()}` } })).json();
  const doc = await (await request.post("/api/documents", { multipart: { folderId: folder.id, file: { name: "Lezione.pdf", mimeType: "application/pdf", buffer: await readFile("public/esempio.pdf") } } })).json();
  await request.patch(`/api/documents/${doc.id}`, { data: { page: 2 } });
  let calls = 0;
  await page.route("**/api/documents/*/visualizations", route => {
    calls++;
    const body = route.request().postDataJSON();
    expect(body.kind).toBe("map"); expect(body.scope).toBe("studied"); expect(body.page).toBe(2);
    expect(body.question).toContain("fino alla pagina 2 inclusa"); expect(body.question).toContain("Lezione.pdf");
    expect(body.question).toContain("ripassare per l'esame"); expect(body.question).toContain("definizioni fondamentali");
    expect(body.question).toContain("pagina fisica");
    expect(body.question).not.toContain("Aggiungi esempi pratici brevi");
    expect(body.question).toContain("Confronta le valvole");
    return route.fulfill({ json: [{ role: "user", content: body.question }, { role: "assistant", content: heartMap.title, artifact: heartMap }] });
  });
  try {
    await page.goto(`/esami/${folder.id}/documenti/${doc.id}`);
    await expect(page.locator(".slide-stage canvas")).toBeVisible();
    if (width < 700) await page.getByRole("button", { name: "Apri chat con Tony", exact: true }).click();
    await page.getByRole("button", { name: "Crea materiale", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Cosa vuoi creare?", exact: true });
    await expect(dialog.getByRole("button", { name: "Usa questo suggerimento", exact: true })).toHaveCount(0);
    await expect(dialog.getByRole("tab", { name: "Materiale studiato", exact: true })).toHaveAttribute("aria-selected", "true");
    await dialog.getByRole("tab", { name: "Tutto il PDF", exact: true }).click();
    await dialog.getByRole("button", { name: /Mappe/ }).click();
    await expect(dialog.getByRole("textbox")).toHaveCount(0);
    const tabs = await dialog.getByRole("tablist").boundingBox();
    const choices = await dialog.getByRole("button", { name: /Mappe/ }).boundingBox();
    expect(tabs!.y).toBeGreaterThan(choices!.y + choices!.height);
    await expect(dialog.getByRole("tab", { name: "Tutto il PDF", exact: true })).toHaveAttribute("aria-selected", "true");
    await dialog.getByRole("tab", { name: "Slide corrente", exact: true }).click();
    await expect(dialog.getByRole("tab", { name: "Slide corrente", exact: true })).toHaveAttribute("aria-selected", "true");
    await dialog.getByRole("tab", { name: "Tutto il PDF", exact: true }).click();
    await dialog.getByRole("button", { name: "Ripasso per l’esame", exact: true }).click();
    await dialog.getByRole("button", { name: "Definizioni chiave", exact: true }).click();
    await dialog.getByRole("button", { name: "Esempi pratici", exact: true }).click();
    await dialog.getByRole("button", { name: "Esempi pratici", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Esempi pratici", exact: true })).toHaveAttribute("aria-pressed", "false");
    await page.screenshot({ path: `test-results/creation-chips-${width}.png` });
    await dialog.getByRole("button", { name: "Aggiungi un dettaglio", exact: true }).click();
    await dialog.getByRole("textbox", { name: "Cosa vuoi aggiungere?", exact: true }).fill("Confronta le valvole");
    expect(calls).toBe(0);
    await page.screenshot({ path: "test-results/creation-guided-prompt.png" });
    await dialog.getByRole("tab", { name: "Materiale studiato", exact: true }).click();
    await dialog.getByRole("button", { name: "Genera mappa", exact: true }).click();
    await expect(page.getByRole("region", { name: "Mappa mentale: Il cuore umano", exact: true })).toBeVisible();
    expect(calls).toBe(1);
  } finally { await request.delete(`/api/folders/${folder.id}`); }
});
