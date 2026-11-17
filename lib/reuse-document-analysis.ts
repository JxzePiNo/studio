import { analysisKey, cachedAnalyses } from "./shared-analysis-cache";
import { analysisPromptSignature } from "./openai";
import type { SlideData } from "./types";

export async function availableDocumentAnalysis(hash: string, pages: number, studyProgram: string, courseName?: string): Promise<Record<string, SlideData>> {
  const context = { studyProgram, courseName, documentName: "Materiale PDF" };
  const keys = Array.from({ length: pages }, (_, page) => analysisKey(hash, page + 1, process.env.OPENAI_MODEL || "gpt-4.1-mini", analysisPromptSignature, context));
  const saved = await cachedAnalyses(keys);
  return Object.fromEntries(keys.flatMap((key, page) => {
    const result = saved.get(key);
    return result ? [[String(page + 1), { notes: "", explanation: result.explanation, generatedAt: result.generatedAt }]] : [];
  }));
}
