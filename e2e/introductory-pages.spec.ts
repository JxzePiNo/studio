import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

test("introductory pages are compact, legacy details remain available and content stays expanded", async ({ page, request }) => {
  const folder = await (await request.post("/api/folders", { data: { name: `Pagine introduttive ${Date.now()}` } })).json();
  const pdf = await PDFDocument.create(); pdf.addPage(); pdf.addPage(); pdf.addPage();
  const doc = await (await request.post("/api/documents", { multipart: { folderId: folder.id, file: { name: "Lezione.pdf", mimeType: "application/pdf", buffer: Buffer.from(await pdf.save()) } } })).json();
  const base = { title: "Copertina", language: "it", overview: "Vecchia spiegazione della copertina", concepts: [], glossary: [], example: "", takeaway: "" };
  await page.route("**/api/status", route => route.fulfill({ json: { configured: true } }));
  await page.route(`**/api/documents/${doc.id}`, route => route.request().method() === "GET" ? route.fulfill({ json: { ...doc, currentPage: 1, slides: {
    1: { notes: "", explanation: base },
    2: { notes: "", explanation: { ...base, title: "Argomenti della lezione", pageKind: "index", overview: "Indice" } },
    3: { notes: "", explanation: { ...base, title: "Il cuore", pageKind: "content", overview: "Un diagramma con contenuto didattico" } },
  } } }) : route.continue());
  try {
    await page.goto(`/esami/${folder.id}/documenti/${doc.id}`);
    const analysis = page.locator('.chat-messages > [data-source="analysis"]');
    await expect(analysis.getByRole("heading", { name: "Copertina", exact: true })).toBeVisible();
    await expect(analysis.getByText("Vecchia spiegazione della copertina", { exact: true })).not.toBeVisible();
    await analysis.getByText("Vedi di più", { exact: true }).click();
    await expect(analysis.getByText("Vecchia spiegazione della copertina", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Pagina successiva", exact: true }).click();
    await expect(analysis.getByRole("heading", { name: "Argomenti della lezione" })).toBeVisible();
    await expect(analysis.getByText("Vedi di più", { exact: true })).toHaveCount(0);
    await expect(analysis.getByText("I CONCETTI CHIAVE", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Pagina successiva", exact: true }).click();
    await expect(analysis.getByText("Un diagramma con contenuto didattico", { exact: true })).toBeVisible();
    await expect(analysis.getByText("Vedi di più", { exact: true })).toHaveCount(0);
  } finally { await request.delete(`/api/folders/${folder.id}`); }
});
