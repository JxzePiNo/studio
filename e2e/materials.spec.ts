import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createExam } from "./exam-helpers";

function material(page: Page, name: string) {
  return page.locator(".material-row").filter({ has: page.getByRole("button", { name: `Apri ${name}`, exact: true }) });
}

async function expectOrder(page: Page, names: string[]) {
  await expect.poll(() => page.locator(".material-open").evaluateAll(rows => rows.map(row => row.getAttribute("aria-label")))).toEqual(names.map(name => `Apri ${name}`));
}

test("carica più PDF, rinomina e riordina i materiali conservando file e appunti", async ({ page, request }) => {
  await page.goto("/");
  const folder = await createExam(page, "Materiali multipli");
  const bytes = await readFile("public/esempio.pdf");
  const cleanup: string[] = [];
  try {
    await page.getByLabel("Carica un PDF", { exact: true }).setInputFiles(["A", "B", "C"].map(letter => ({ name: `Originale ${letter}.pdf`, mimeType: "application/pdf", buffer: bytes })));
    await expect(page.locator(".material-row")).toHaveCount(3);
    await expect(page.locator(".selected-exam")).toContainText(folder.name);
    await expect(page.locator(".study-grid")).toHaveCount(0);
    await expect(page.locator(".upload-progress")).toContainText("3 PDF caricati");
    await expect(page.getByRole("progressbar", { name: "PDF caricati", exact: true })).toHaveAttribute("value", "3");
    await expectOrder(page, ["Originale A", "Originale B", "Originale C"]);
    const documents = (await (await request.get("/api/documents")).json()).filter((doc: { folderId: string }) => doc.folderId === folder.id);
    cleanup.push(...documents.map((doc: { id: string }) => doc.id));
    const renamed = documents.find((doc: { name: string }) => doc.name === "Originale B.pdf");
    expect(renamed).toBeTruthy();
    expect((await request.patch(`/api/documents/${renamed.id}`, { data: { page: 1, notes: "Appunto da conservare dopo la rinomina." } })).ok()).toBeTruthy();
    const originalPdf = await (await request.get(`/api/documents/${renamed.id}/pdf`)).body();

    await material(page, "Originale B").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Rinomina", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Rinomina materiale", exact: true });
    await dialog.getByRole("textbox", { name: "Nome del materiale", exact: true }).fill("Lezione 1");
    await dialog.getByRole("button", { name: "Salva nome", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(material(page, "Lezione 1")).toBeVisible();
    const stored = await (await request.get(`/api/documents/${renamed.id}`)).json();
    expect(stored.name).toMatch(/^Lezione 1(?:\.pdf)?$/);
    expect(stored.slides[1].notes).toBe("Appunto da conservare dopo la rinomina.");
    expect((await (await request.get(`/api/documents/${renamed.id}/pdf`)).body()).equals(originalPdf)).toBeTruthy();

    await page.getByRole("button", { name: "Azioni Lezione 1", exact: true }).click();
    await page.getByRole("menuitem", { name: "Sposta in fondo", exact: true }).click();
    await expectOrder(page, ["Originale A", "Originale C", "Lezione 1"]);
    await material(page, "Lezione 1").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Sposta su", exact: true }).click();
    await expectOrder(page, ["Originale A", "Lezione 1", "Originale C"]);
    await material(page, "Lezione 1").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Sposta giù", exact: true }).click();
    await expectOrder(page, ["Originale A", "Originale C", "Lezione 1"]);
    await material(page, "Lezione 1").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Sposta all’inizio", exact: true }).click();
    await expectOrder(page, ["Lezione 1", "Originale A", "Originale C"]);
    await page.reload();
    await page.locator(".sidebar .folder-item").filter({ hasText: folder.name }).click();
    await expectOrder(page, ["Lezione 1", "Originale A", "Originale C"]);

    await page.getByRole("button", { name: "Azioni Originale C", exact: true }).click();
    await page.getByRole("menuitem", { name: "Sposta all’inizio", exact: true }).click();
    await expectOrder(page, ["Originale C", "Lezione 1", "Originale A"]);
    await material(page, "Originale C").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Ordina per nome", exact: true }).click();
    await expectOrder(page, ["Lezione 1", "Originale A", "Originale C"]);

    const otherFolder = await (await request.post("/api/folders", { data: { name: "Altro esame" } })).json();
    const foreign = await (await request.post("/api/documents", { multipart: { folderId: otherFolder.id, file: { name: "Altro.pdf", mimeType: "application/pdf", buffer: bytes } } })).json();
    cleanup.push(foreign.id);
    const crossFolderOrder = await request.patch(`/api/folders/${folder.id}/order`, { data: { documentId: foreign.id, move: "first" } });
    expect(crossFolderOrder.status()).toBe(404);
    const unchanged = (await (await request.get("/api/folders")).json()).find((item: { id: string }) => item.id === folder.id);
    expect(unchanged.documentOrder).not.toContain(foreign.id);
    await page.screenshot({ path: "test-results/material-actions.png", fullPage: true });
  } finally { for (const id of cleanup) await request.delete(`/api/documents/${id}`); }
});

test("un PDF non valido non annulla i file riusciti nello stesso caricamento", async ({ page, request }) => {
  await page.goto("/");
  const folder = await createExam(page, "Caricamento parziale");
  const bytes = await readFile("public/esempio.pdf");
  try {
    await page.getByLabel("Carica un PDF", { exact: true }).setInputFiles([
      { name: "Lezione valida.pdf", mimeType: "application/pdf", buffer: bytes },
      { name: "Lezione danneggiata.pdf", mimeType: "application/pdf", buffer: Buffer.from("invalid PDF") },
    ]);
    await expect(page.locator(".material-row")).toHaveCount(1);
    await expect(material(page, "Lezione valida")).toBeVisible();
    await expect(page.locator('.error-banner[role="alert"]').filter({ hasText: "Lezione danneggiata.pdf" })).toBeVisible();
    await expect(page.locator(".upload-progress")).toContainText("1 PDF caricati");
    await expect(page.locator(".upload-progress")).toContainText("1 file non caricati");
    await expect(page.locator(".selected-exam")).toContainText(folder.name);
    await expect(page.locator(".upload-progress")).toHaveCount(0, { timeout: 6500 });
    await expect(page.locator('.error-banner[role="alert"]').filter({ hasText: "Lezione danneggiata.pdf" })).toBeVisible();
    await page.reload();
    await page.locator(".sidebar .folder-item").filter({ hasText: folder.name }).click();
    await expect(page.locator(".material-row")).toHaveCount(1);
    await expect(material(page, "Lezione valida")).toBeVisible();
  } finally {
    const documents = await (await request.get("/api/documents")).json();
    for (const doc of documents.filter((item: { folderId: string }) => item.folderId === folder.id)) await request.delete(`/api/documents/${doc.id}`);
  }
});
