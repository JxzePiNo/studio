import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { heartMap } from "../lib/artifact-example";
import type { ChatMessage } from "../lib/types";

test("Crea offers three simple choices, Tony beside the title and no demo section", async ({ page, request }) => {
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
    await expect(dialog.getByRole("textbox")).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Esempio: il cuore", exact: true })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Nomi e funzioni", exact: true })).toBeVisible();
    await expect(dialog.getByText("Vuoi vedere come funziona?")).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Prova una mappa", exact: true })).toHaveCount(0);
    await expect(dialog.locator("header svg").first()).toBeVisible();
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
    await dialog.getByRole("tab", { name: "Tutto il PDF", exact: true }).click();
    await dialog.getByRole("button", { name: "Genera mappa", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const map = page.getByRole("region", { name: "Mappa mentale: Il cuore umano", exact: true });
    await expect(map).toBeVisible();
    await page.getByRole("button", { name: "Apri Mappa", exact: true }).click();
    const fullMap = page.getByRole("dialog", { name: "Il cuore umano", exact: true });
    await expect(fullMap.locator(".react-flow__node")).toHaveCount(10);
    await fullMap.locator('.react-flow__node[data-id="heart"]').click();
    const rootDetail = page.getByRole("dialog", { name: "Cuore", exact: true });
    await expect(rootDetail.getByRole("region", { name: "Spiegazione del concetto" })).toContainText("Pompa muscolare");
    await expect(rootDetail.getByRole("region", { name: "Collegamenti del concetto" })).toContainText("Cuore destro");
    await expect(rootDetail.getByRole("button", { name: "Vai alla pagina", exact: true })).toBeDisabled();
    await rootDetail.getByRole("button", { name: "Chiudi", exact: true }).click();
    await expect(fullMap).toBeVisible();
    await fullMap.getByRole("button", { name: "Riduci Cuore destro", exact: true }).click();
    await expect(fullMap.locator(".react-flow__node")).toHaveCount(8);
    await fullMap.getByRole("button", { name: "Espandi Cuore destro", exact: true }).click();
    const download = page.waitForEvent("download"); await fullMap.getByRole("button", { name: "SVG", exact: true }).click();
    expect((await download).suggestedFilename()).toMatch(/\.svg$/);
    await fullMap.getByRole("button", { name: "Chiudi schermo intero", exact: true }).click();
    const rootLabel = map.locator('.react-flow__node[data-id="heart"] strong');
    await expect(rootLabel).not.toHaveCSS("color", "rgb(23, 32, 51)");
    const nodeTextColor = await rootLabel.evaluate(element => getComputedStyle(element).color);
    await expect(rootLabel).toHaveCSS("font-size", "13px");
    await map.getByRole("button", { name: "Modifica", exact: true }).click();
    await map.getByLabel("Nome", { exact: true }).fill("Cuore modificato");
    await map.getByRole("button", { name: "Salva modifiche", exact: true }).click();
    await expect(map.getByRole("button", { name: "Salva modifiche", exact: true })).toHaveCount(0);
    await page.reload();
    await expect(map.locator(".react-flow__node").filter({ hasText: "Cuore modificato" })).toHaveCount(1);
    await map.getByRole("button", { name: "Apri a schermo intero", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Il cuore umano", exact: true }).locator(".react-flow__node")).toHaveCount(10);
    await expect(page.getByRole("dialog", { name: "Il cuore umano", exact: true }).locator('.react-flow__node[data-id="heart"] strong')).toHaveCSS("color", nodeTextColor);
    await page.getByRole("dialog", { name: "Il cuore umano", exact: true }).locator('.react-flow__node[data-id="atrium-r"]').click();
    const detail = page.getByRole("dialog", { name: "Atrio destro", exact: true });
    await expect(detail.getByRole("region", { name: "Spiegazione del concetto" })).toContainText("vene cave");
    await expect(page.getByRole("spinbutton", { name: "Numero della slide", exact: true, includeHidden: true })).toHaveValue("1");
    await detail.getByRole("button", { name: "Vai alla pagina 2", exact: true }).click();
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

test("multiple generated materials open a notification-style picker on mobile and survive reload", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const folder = await (await request.post("/api/folders", { data: { name: `Generazioni ${Date.now()}` } })).json();
  const doc = await (await request.post("/api/documents", { multipart: { folderId: folder.id, file: { name: "Lezione.pdf", mimeType: "application/pdf", buffer: await readFile("public/esempio.pdf") } } })).json();
  const second = { ...heartMap, id: "55e45850-c145-49a6-b74b-abc2b77d3460", title: "Ripasso del cuore" };
  let messages: ChatMessage[] = [heartMap, second].map(artifact => ({ role: "assistant", content: artifact.title, artifact }));
  await page.route(`**/api/documents/${doc.id}/visualizations`, async route => {
    const body = route.request().postDataJSON();
    if (route.request().method() === "PATCH") messages = messages.map(message => message.artifact?.id === body.artifact.id ? { ...message, content: body.artifact.title, artifact: body.artifact } : message);
    else if (route.request().method() === "DELETE") messages = messages.filter(message => message.artifact?.id !== body.artifactId);
    else return route.fallback();
    return route.fulfill({ json: messages });
  });
  await page.route(`**/api/documents/${doc.id}`, async route => {
    if (route.request().method() !== "GET") return route.fallback();
    const response = await route.fetch(); const data = await response.json();
    data.slides[1] = { ...data.slides[1], chat: messages };
    return route.fulfill({ json: data });
  });
  try {
    await page.goto(`/esami/${folder.id}/documenti/${doc.id}`);
    const trigger = page.getByRole("button", { name: "Generazioni, 2 materiali", exact: true });
    await expect(trigger).toBeVisible();
    const box = await trigger.boundingBox(); expect(box && box.x >= 0 && box.x + box.width <= 390).toBeTruthy();
    await trigger.click();
    const picker = page.getByRole("dialog", { name: "Materiali generati", exact: true });
    await expect(picker.getByRole("heading", { name: "Le tue generazioni" })).toBeVisible();
    await expect(picker.getByRole("button", { name: /^Il cuore umano/ })).toBeVisible();
    await picker.getByRole("button", { name: /^Ripasso del cuore/ }).click();
    const full = page.getByRole("dialog", { name: second.title, exact: true });
    await expect(full.locator(".react-flow__node")).toHaveCount(10);
    await full.locator('.react-flow__node[data-id="heart"]').click();
    const detail = page.getByRole("dialog", { name: "Cuore", exact: true });
    await expect(detail).toBeVisible();
    const closeBox = await detail.getByRole("button", { name: "Chiudi", exact: true }).boundingBox();
    const pageBox = await detail.getByRole("button", { name: "Vai alla pagina", exact: true }).boundingBox();
    expect(pageBox!.width / closeBox!.width).toBeCloseTo(2, 1);
    await page.screenshot({ path: "test-results/map-concept-mobile.png" });
    await detail.getByRole("button", { name: "Chiudi", exact: true }).click();
    await full.getByRole("button", { name: "Chiudi schermo intero" }).click();
    await page.reload();
    await trigger.click();
    await expect(picker.getByRole("button", { name: /^Ripasso del cuore/ })).toBeVisible();
    await page.screenshot({ path: "test-results/generated-materials-mobile.png" });
    await picker.getByRole("button", { name: "Azioni Ripasso del cuore", exact: true }).click();
    await page.getByRole("menuitem", { name: "Rinomina", exact: true }).click();
    const rename = page.getByRole("dialog", { name: "Rinomina generazione", exact: true });
    await rename.getByRole("textbox", { name: "Nome", exact: true }).fill("Mappa per l'esame");
    await rename.getByRole("button", { name: "Salva", exact: true }).click();
    await expect(rename).toHaveCount(0);
    await page.reload(); await trigger.click();
    const renamed = picker.getByRole("button", { name: /^Mappa per l'esame/ });
    await expect(renamed).toBeVisible();
    await renamed.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Elimina", exact: true }).click();
    await page.getByRole("dialog", { name: "Elimina generazione", exact: true }).getByRole("button", { name: "Elimina", exact: true }).click();
    const single = page.getByRole("button", { name: "Apri Mappa", exact: true });
    await expect(single).toBeVisible(); await single.click();
    const remaining = page.getByRole("dialog", { name: heartMap.title, exact: true });
    await remaining.getByRole("button", { name: `Azioni ${heartMap.title}`, exact: true }).click();
    await page.getByRole("menuitem", { name: "Elimina", exact: true }).click();
    await page.getByRole("dialog", { name: "Elimina generazione", exact: true }).getByRole("button", { name: "Elimina", exact: true }).click();
    await expect(single).toHaveCount(0);
    await page.reload();
    await expect(page.locator(".slide-stage canvas")).toBeVisible();
    await expect(single).toHaveCount(0);
  } finally { await request.delete(`/api/folders/${folder.id}`); }
});
