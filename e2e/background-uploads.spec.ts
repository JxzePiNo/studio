import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("upload continues while navigating, stays in its original course and does not close an open reader", async ({ page, request }) => {
  const folder = await (await request.post("/api/folders", { data: { name: `Upload di origine ${Date.now()}` } })).json();
  const original = await (await request.post("/api/documents", { multipart: { folderId: folder.id, file: { name: "Esistente.pdf", mimeType: "application/pdf", buffer: await readFile("public/esempio.pdf") } } })).json();
  await page.goto(`/esami/${folder.id}`);
  await expect(page.getByRole("button", { name: "Apri Esistente", exact: true })).toBeVisible();
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
  let received = false;
  await page.route("**/api/documents", async route => {
    if (route.request().method() !== "POST") return route.fallback();
    received = true; await held; await route.continue();
  });
  try {
    await page.getByLabel("Carica PDF o immagini", { exact: true }).setInputFiles({ name: "In-background.pdf", mimeType: "application/pdf", buffer: await readFile("public/esempio.pdf") });
    await expect.poll(() => received).toBe(true);
    await expect(page.getByRole("button", { name: "Mostra caricamenti in background", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Torna alla home", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.getByRole("button", { name: "Sessioni di studio", exact: true }).click();
    await expect(page).toHaveURL(/\/sessioni$/);
    await page.goBack();
    await page.locator(".sidebar .folder-item").filter({ hasText: /Upload di origine/i }).click();
    await page.getByRole("button", { name: "Apri Esistente", exact: true }).click();
    await expect(page.locator(".slide-stage canvas")).toBeVisible();
    release();
    await expect(page.getByRole("button", { name: "Mostra caricamenti in background", exact: true })).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/documenti/${original.id}$`));
    await page.getByRole("button", { name: /^Mostra notifiche/ }).click();
    const popup = page.getByRole("dialog", { name: "Notifiche", exact: true });
    await expect(popup.getByRole("region", { name: "Caricamenti in background" })).toContainText("In-background.pdf");
    await popup.getByRole("button", { name: "Apri materiale", exact: true }).click();
    await expect(popup).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/esami/${folder.id}/documenti/`));
    const docs = await (await request.get("/api/documents")).json();
    expect(docs.find((doc: { name: string; folderId: string }) => doc.name === "In-background.pdf").folderId).toBe(folder.id);
  } finally { release(); await request.delete(`/api/folders/${folder.id}`); }
});
