import { test, expect } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createExam } from "./exam-helpers";
import { analysisKey } from "../lib/shared-analysis-cache";
import { analysisPromptSignature } from "../lib/openai";
import { pdfHash } from "../lib/pdf-content";

test("identical renamed PDFs reuse an existing analysis while personal annotations stay separate", async ({ page, request }) => {
  await page.goto("/");
  const exam = await createExam(page, "Cache PDF");
  const bytes = await readFile("public/esempio.pdf");
  const ids: string[] = [];
  let analysisRequests = 0;
  page.on("request", request => { if (request.url().includes("/analyze")) analysisRequests++; });
  try {
    for (const name of ["Originale-cache.pdf", "Rinominato-cache.pdf"]) {
      const uploaded = page.waitForResponse(response => response.url().endsWith("/api/documents") && response.request().method() === "POST");
      await page.getByLabel("Carica PDF o immagini", { exact: true }).setInputFiles({ name, mimeType: "application/pdf", buffer: bytes });
      const result = await (await uploaded).json(); ids.push(result.id);
      if (ids.length === 1) {
        const dataRoot = path.resolve(process.env.STUDIO_E2E_READER === "true" ? ".e2e-reader-data" : ".e2e-data");
        const profile = JSON.parse(await readFile(path.join(dataRoot, "profile.json"), "utf8"));
        const directory = path.join(dataRoot, ".analysis-cache");
        await mkdir(directory, { recursive: true });
        for (let number = 1; number <= result.pages; number++) {
          const key = analysisKey(pdfHash(bytes), number, process.env.OPENAI_MODEL || "gpt-4.1-mini", analysisPromptSignature, { studyProgram: profile.studyProgram, courseName: exam.name, documentName: "Materiale PDF" });
          await writeFile(path.join(directory, `${key}.json`), JSON.stringify({ generatedAt: new Date().toISOString(), explanation: { title: "Concetto già analizzato", language: "it", overview: "Questa spiegazione arriva dalla cache verificata del PDF.", concepts: [], glossary: [], example: "", takeaway: "" } }));
        }
      } else {
        expect(Object.values(result.slides).filter((slide: any) => slide.explanation)).toHaveLength(result.pages);
        expect(result.slides[1].notes).toBe("");
        expect(result.slides[1].read).toBeUndefined();
        expect(result.slides[1].chat).toBeUndefined();
      }
    }
    await request.patch(`/api/documents/${ids[0]}`, { data: { page: 1, notes: "Appunti personali da non copiare", read: true } });
    await expect(page.getByRole("button", { name: "Apri Rinominato-cache", exact: true })).toContainText("Analizzato");
    await page.getByRole("button", { name: "Apri Rinominato-cache", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Concetto già analizzato", exact: true })).toBeVisible();
    await expect(page.getByText("Questa spiegazione arriva dalla cache verificata del PDF.", { exact: true })).toBeVisible();
    await expect(page.getByText("Appunti personali da non copiare", { exact: true })).toHaveCount(0);
    expect(analysisRequests).toBe(0);
  } finally {
    for (const id of ids) await request.delete(`/api/documents/${id}`);
    await request.delete(`/api/folders/${exam.id}`);
  }
});
