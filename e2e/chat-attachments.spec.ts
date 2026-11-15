import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

for (const width of [1280, 390]) test(`chat sends supplemental files and keeps completion notifications closed at ${width}px`, async ({ page, request }) => {
  await page.setViewportSize({ width, height: 900 });
  const folder = await (await request.post("/api/folders", { data: { name: `Allegati ${Date.now()}` } })).json();
  const doc = await (await request.post("/api/documents", { multipart: { folderId: folder.id, file: { name: "Lezione.pdf", mimeType: "application/pdf", buffer: await readFile("public/esempio.pdf") } } })).json();
  await page.route("**/api/status", route => route.fulfill({ json: { configured: true } }));
  const calls: any[] = [];
  await page.route(`**/api/documents/${doc.id}/chat`, async route => {
    const body = route.request().postDataJSON(); calls.push(body);
    await route.fulfill({ json: [{ role: "user", content: body.question, attachments: body.attachments.map((file: any) => ({ name: file.name, size: Buffer.from(file.data, "base64").length })) }, { role: "assistant", content: "Ho collegato le formule degli appunti alla slide." }] });
  });
  try {
    await page.goto(`/esami/${folder.id}/documenti/${doc.id}`);
    await expect(page.locator(".slide-stage canvas")).toBeVisible();
    if (width < 700) await page.getByRole("button", { name: "Apri chat con Tony", exact: true }).click();
    const input = page.getByLabel("Allega file alla domanda", { exact: true });
    await input.setInputFiles({ name: "Appunti.txt", mimeType: "text/plain", buffer: Buffer.from("Energia: E = mc²") });
    await expect(page.getByRole("list", { name: "Allegati da inviare", exact: true })).toContainText("Appunti.txt");
    await page.getByRole("button", { name: "Rimuovi allegato Appunti.txt", exact: true }).click();
    await expect(page.getByRole("list", { name: "Allegati da inviare", exact: true })).toHaveCount(0);
    await input.setInputFiles([{ name: "Appunti.txt", mimeType: "text/plain", buffer: Buffer.from("Energia: E = mc²") }, { name: "Esercizi.pdf", mimeType: "application/pdf", buffer: await readFile("public/esempio.pdf") }]);
    await page.getByRole("textbox", { name: "Domanda al tutor", exact: true }).fill("Collega questi appunti alla slide.");
    await page.getByRole("button", { name: "Invia domanda", exact: true }).click();
    await expect(page.locator(".chat-message.assistant")).toContainText("formule degli appunti");
    expect(calls).toHaveLength(1);
    expect(calls[0].attachments.map((file: any) => file.name)).toEqual(["Appunti.txt", "Esercizi.pdf"]);
    expect(Buffer.from(calls[0].attachments[0].data, "base64").toString()).toBe("Energia: E = mc²");
    await expect(page.getByRole("list", { name: "Allegati della domanda", exact: true })).toContainText("Appunti.txt");
    await expect(page.getByRole("dialog", { name: "Notifiche", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Mostra notifiche, 1 nuova/ })).toBeVisible();
    await page.getByRole("button", { name: /Mostra notifiche/ }).click();
    await expect(page.getByRole("dialog", { name: "Notifiche", exact: true })).toContainText("La risposta è pronta");
  } finally { await request.delete(`/api/folders/${folder.id}`); }
});
