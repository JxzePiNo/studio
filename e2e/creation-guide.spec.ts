import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { heartMap } from "../lib/artifact-example";

test("the suggested PDF map and guided choices prepare a ready prompt without generating until confirmation", async ({ page, request }) => {
  await page.route("**/api/status", route => route.fulfill({ json: { configured: true } }));
  const folder = await (await request.post("/api/folders", { data: { name: `Guida mappe ${Date.now()}` } })).json();
  const doc = await (await request.post("/api/documents", { multipart: { folderId: folder.id, file: { name: "Lezione.pdf", mimeType: "application/pdf", buffer: await readFile("public/esempio.pdf") } } })).json();
  let calls = 0;
  await page.route("**/api/documents/*/visualizations", route => {
    calls++;
    const body = route.request().postDataJSON();
    expect(body.kind).toBe("map"); expect(body.scope).toBe("document");
    expect(body.question).toContain("l'intero PDF"); expect(body.question).toContain("Lezione.pdf");
    expect(body.question).toContain("ripassare per l'esame"); expect(body.question).toContain("definizioni fondamentali");
    expect(body.question).toContain("pagina fisica");
    return route.fulfill({ json: [{ role: "user", content: body.question }, { role: "assistant", content: heartMap.title, artifact: heartMap }] });
  });
  try {
    await page.goto(`/esami/${folder.id}/documenti/${doc.id}`);
    await page.getByRole("button", { name: "Crea materiale", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Cosa vuoi creare?", exact: true });
    await dialog.getByRole("button", { name: "Usa questo suggerimento", exact: true }).click();
    const prompt = dialog.getByRole("textbox", { name: "Che cosa vuoi creare?", exact: true });
    await expect(prompt).toHaveValue(/mappa concettuale.*intero PDF/);
    await expect(dialog.getByRole("button", { name: "Tutto il PDF", exact: true })).toHaveAttribute("aria-pressed", "true");
    await dialog.getByRole("button", { name: "Non so cosa chiedere: guidami", exact: true }).click();
    await dialog.getByRole("button", { name: "Ripassare per l'esame", exact: true }).click();
    await dialog.getByRole("button", { name: "Definizioni", exact: true }).click();
    await expect(prompt).toHaveValue(/ripassare per l'esame/);
    expect(calls).toBe(0);
    await page.screenshot({ path: "test-results/creation-guided-prompt.png" });
    await dialog.getByRole("button", { name: "Genera mappa", exact: true }).click();
    await expect(page.getByRole("region", { name: "Mappa mentale: Il cuore umano", exact: true })).toBeVisible();
    expect(calls).toBe(1);
  } finally { await request.delete(`/api/folders/${folder.id}`); }
});
