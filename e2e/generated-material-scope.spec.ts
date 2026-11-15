import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { heartMap } from "../lib/artifact-example";
import { formatCourseName } from "../lib/course-name";

test("generated material shortcut stays within its course", async ({ page, request }) => {
  test.setTimeout(60000);
  const folder = await (await request.post("/api/folders", { data: { name: `Generazioni ${Date.now()}` } })).json();
  const other = await (await request.post("/api/folders", { data: { name: `Altro esame ${Date.now()}` } })).json();
  const pdf = await PDFDocument.create(); pdf.addPage([600, 850]);
  const doc = await (await request.post("/api/documents", { multipart: { folderId: folder.id, file: { name: "Lezione.pdf", mimeType: "application/pdf", buffer: Buffer.from(await pdf.save()) } } })).json();
  await page.route(`**/api/documents/${doc.id}`, route => route.request().method() === "GET" ? route.fulfill({ json: { ...doc, slides: { "1": { notes: "", chat: [{ role: "assistant", content: heartMap.title, artifact: heartMap }] } } } }) : route.continue());
  const shortcut = page.getByRole("button", { name: "Apri Mappa", exact: true });
  try {
    await page.goto(`/esami/${folder.id}/documenti/${doc.id}`);
    await expect(shortcut).toBeVisible();
    await page.getByRole("button", { name: "Torna alla biblioteca", exact: true }).click();
    await expect(shortcut).toBeVisible();
    await page.goto(`/esami/${other.id}`);
    await expect(page.getByRole("heading", { name: formatCourseName(other.name), exact: true })).toBeVisible();
    await expect(shortcut).toHaveCount(0);
    await page.goto("/");
    await expect(page.getByRole("searchbox", { name: "Cerca un esame", exact: true })).toBeVisible();
    await expect(shortcut).toHaveCount(0);
    await page.goto(`/esami/${folder.id}`);
    await expect(shortcut).toBeVisible();
  } finally {
    await request.delete(`/api/folders/${folder.id}`);
    await request.delete(`/api/folders/${other.id}`);
  }
});
