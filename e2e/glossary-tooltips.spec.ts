import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

for (const width of [1280, 390]) test(`slide glossary renders formulas and shared tooltips work at ${width}px`, async ({ page, request }) => {
  await page.setViewportSize({ width, height: 900 });
  const folder = await (await request.post("/api/folders", { data: { name: `Glossario ${Date.now()}` } })).json();
  const pdf = await PDFDocument.create(); pdf.addPage([600, 850]);
  const doc = await (await request.post("/api/documents", { multipart: { folderId: folder.id, file: { name: "Glossario.pdf", mimeType: "application/pdf", buffer: Buffer.from(await pdf.save()) } } })).json();
  const explanation = { pageKind: "content", title: "Legge di Ohm", language: "it", overview: "La tensione dipende da corrente e resistenza.", concepts: [{ title: "Resistenza", explanation: "Il rapporto tra tensione e corrente." }], example: "Un resistore.", takeaway: "La relazione vale per conduttori ohmici.", glossary: [{ word: "$V = RI$", translation: "Legge di Ohm", context: "$V$ indica la tensione, $R$ la resistenza e $I$ la corrente. Vale per un conduttore ohmico a temperatura costante." }] };
  await page.route(`**/api/documents/${doc.id}`, route => route.request().method() === "GET" ? route.fulfill({ json: { ...doc, slides: { "1": { notes: "", explanation, chat: [{ role: "assistant", content: "Una risposta del tutor." }] } } } }) : route.continue());
  try {
    await page.goto(`/esami/${folder.id}/documenti/${doc.id}`);
    await expect(page.getByRole("button", { name: "Approfondisci", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Mostra pannello inferiore", exact: true }).click();
    const glossary = page.getByRole("region", { name: "Glossario della slide", exact: true });
    await expect(glossary).toContainText("Legge di Ohm");
    await expect(glossary.locator(".katex").first()).toBeVisible();
    await expect(glossary).toContainText("temperatura costante");
    const bell = page.getByRole("button", { name: /^Mostra notifiche/ });
    await bell.focus();
    await expect(page.getByRole("tooltip")).toContainText("Notifiche");
    await bell.click();
    await expect(page.getByRole("dialog", { name: "Notifiche", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Chiudi notifiche", exact: true }).click();
    await expect(page.locator("[title]")).toHaveCount(0);
  } finally { await request.delete(`/api/folders/${folder.id}`); }
});
