import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { heartMap } from "../lib/artifact-example";
import type { ChatMessage } from "../lib/types";

test("Crea offers three simple choices and a free interactive, editable mind map", async ({ page, request }) => {
  const folder = await (await request.post("/api/folders", { data: { name: `Mappa esempio ${Date.now()}` } })).json();
  const doc = await (await request.post("/api/documents", { multipart: { folderId: folder.id, file: { name: "Lezione.pdf", mimeType: "application/pdf", buffer: await readFile("public/esempio.pdf") } } })).json();
  try {
    await page.goto(`/esami/${folder.id}/documenti/${doc.id}`);
    await page.getByRole("button", { name: "Crea materiale", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Cosa vuoi creare?", exact: true });
    for (const name of ["Mappe", "Immagini", "Schemi"]) await expect(dialog.getByRole("button", { name: new RegExp(name) })).toBeVisible();
    await expect(dialog.getByRole("textbox")).toHaveCount(0);
    await dialog.getByRole("button", { name: /Immagini/ }).click();
    await expect(dialog.getByRole("button", { name: "Genera immagine", exact: true })).toBeDisabled();
    await dialog.getByRole("button", { name: "Esempio: il cuore", exact: true }).click();
    await expect(dialog.getByRole("textbox", { name: "Che cosa vuoi creare?" })).toHaveValue(/illustrazione interattiva/);
    await dialog.getByRole("button", { name: "Prova una mappa", exact: true }).click();
    const map = dialog.getByRole("region", { name: "Mappa mentale: Il cuore umano", exact: true });
    await expect(map.locator(".react-flow__node")).toHaveCount(10);
    await map.getByRole("button", { name: "Atrio destro", exact: true }).click();
    await expect(map.getByRole("region", { name: "Spiegazione del concetto" })).toContainText("vene cave");
    await map.getByRole("button", { name: "Riduci Cuore destro", exact: true }).click();
    await expect(map.locator(".react-flow__node")).toHaveCount(8);
    await map.getByRole("button", { name: "Espandi Cuore destro", exact: true }).click();
    await map.getByRole("button", { name: "Modifica", exact: true }).click();
    await map.getByLabel("Nome", { exact: true }).fill("Atrio destro modificato");
    await expect(map.locator(".react-flow__node").filter({ hasText: "Atrio destro modificato" })).toBeVisible();
    const download = page.waitForEvent("download"); await map.getByRole("button", { name: "SVG", exact: true }).click();
    expect((await download).suggestedFilename()).toMatch(/\.svg$/);
    await page.screenshot({ path: "test-results/crea-map-example.png" });
  } finally { await request.delete(`/api/folders/${folder.id}`); }
});

test("generated maps appear in chat, save edits and survive reopening", async ({ page, request }) => {
  await page.route("**/api/status", route => route.fulfill({ json: { configured: true } }));
  const folder = await (await request.post("/api/folders", { data: { name: `Mappa salvata ${Date.now()}` } })).json();
  const doc = await (await request.post("/api/documents", { multipart: { folderId: folder.id, file: { name: "Lezione.pdf", mimeType: "application/pdf", buffer: await readFile("public/esempio.pdf") } } })).json();
  let messages: ChatMessage[] = [];
  await page.route(`**/api/documents/${doc.id}`, async route => {
    if (route.request().method() !== "GET") return route.fallback();
    const original = await route.fetch(); const data = await original.json();
    if (messages.length) data.slides[1] = { ...data.slides[1], chat: messages };
    return route.fulfill({ json: data });
  });
  await page.route("**/api/documents/*/visualizations", async route => {
    const body = route.request().postDataJSON();
    if (route.request().method() === "PATCH") {
      messages = messages.map(message => message.artifact ? { ...message, artifact: body.artifact } : message);
    } else {
      expect(body.scope).toBe("document"); expect(body.page).toBe(1); expect(body.kind).toBe("map");
      messages = [{ role: "user", content: body.question }, { role: "assistant", content: heartMap.title, artifact: { ...heartMap, nodes: heartMap.nodes.map(node => ({ ...node, sourcePage: node.id === "atrium-r" ? 2 : null })) } }];
    }
    return route.fulfill({ json: messages });
  });
  try {
    await page.goto(`/esami/${folder.id}/documenti/${doc.id}`);
    await page.getByRole("button", { name: "Tutto PDF", exact: true }).click();
    await page.getByRole("button", { name: "Crea materiale", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Cosa vuoi creare?", exact: true });
    await dialog.getByRole("button", { name: /Mappe/ }).click();
    await dialog.getByRole("button", { name: "Esempio: il cuore", exact: true }).click();
    await dialog.getByRole("button", { name: "Genera mappa", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const map = page.getByRole("region", { name: "Mappa mentale: Il cuore umano", exact: true });
    await expect(map).toBeVisible();
    await map.getByRole("button", { name: "Modifica", exact: true }).click();
    await map.getByLabel("Nome", { exact: true }).fill("Cuore modificato");
    await map.getByRole("button", { name: "Salva modifiche", exact: true }).click();
    await expect(map.getByRole("button", { name: "Salva modifiche", exact: true })).toHaveCount(0);
    await page.reload();
    await expect(map.locator(".react-flow__node").filter({ hasText: "Cuore modificato" })).toHaveCount(1);
    await map.getByRole("button", { name: "Apri a schermo intero", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Il cuore umano", exact: true }).locator(".react-flow__node")).toHaveCount(10);
    await page.getByRole("dialog", { name: "Il cuore umano", exact: true }).getByRole("button", { name: "Atrio destro", exact: true }).click();
    await expect(page.getByRole("spinbutton", { name: "Numero della slide", exact: true })).toHaveValue("2");
    await expect(page.getByRole("dialog", { name: "Il cuore umano", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Torna alla mappa", exact: true }).click();
    await expect(page.getByRole("spinbutton", { name: "Numero della slide", exact: true })).toHaveValue("1");
    await expect(map).toBeVisible();
  } finally { await request.delete(`/api/folders/${folder.id}`); }
});

test("on mobile Crea offers image hotspots with tap explanations", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const folder = await (await request.post("/api/folders", { data: { name: `Immagine ${Date.now()}` } })).json();
  const doc = await (await request.post("/api/documents", { multipart: { folderId: folder.id, file: { name: "Lezione.pdf", mimeType: "application/pdf", buffer: await readFile("public/esempio.pdf") } } })).json();
  const artifact = { id: heartMap.id, kind: "image", title: "Cellula", summary: "Parti della cellula", note: "", image: { assetId: heartMap.id, width: 1, height: 1 }, hotspots: [{ id: "nucleus", label: "Nucleo", description: "Contiene il DNA.", x: 50, y: 50, color: "#ddd6fe" }, { id: "membrane", label: "Membrana", description: "Delimita la cellula.", x: 80, y: 50, color: "#bfdbfe" }] };
  await page.route(`**/api/documents/${doc.id}`, async route => {
    if (route.request().method() !== "GET") return route.fallback();
    const response = await route.fetch(); const data = await response.json(); data.slides[1] = { ...data.slides[1], chat: [{ role: "assistant", content: artifact.title, artifact }] }; return route.fulfill({ json: data });
  });
  await page.route("**/visualizations/*/image", route => route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ3sAAAAASUVORK5CYII=", "base64") }));
  try {
    await page.goto(`/esami/${folder.id}/documenti/${doc.id}`);
    await expect(page.locator(".slide-stage canvas")).toBeVisible();
    await page.getByRole("button", { name: "Apri chat con Tony", exact: true }).click();
    await expect(page.getByRole("button", { name: "Chiudi chat con Tony", exact: true })).toBeVisible();
    const image = page.getByRole("region", { name: "Immagine interattiva: Cellula", exact: true });
    await expect(image.getByRole("img", { name: "Cellula" })).toBeVisible();
    await image.getByRole("button", { name: "Membrana", exact: true }).first().click();
    await expect(image.getByRole("region", { name: "Spiegazione della parte" })).toContainText("Delimita la cellula");
    await page.getByRole("button", { name: "Crea materiale", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Cosa vuoi creare?" }).getByRole("button", { name: /Immagini/ })).toBeVisible();
    await page.screenshot({ path: "test-results/crea-mobile.png" });
  } finally { await request.delete(`/api/folders/${folder.id}`); }
});
