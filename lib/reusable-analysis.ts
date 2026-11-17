import { analysisExplanationSchema } from "./schema";
import type { SlideData } from "./types";

/** Deliberately exclude every field belonging to a student's study activity. */
export function analysisOnlySlide(source: SlideData): SlideData | undefined {
  const parsed = analysisExplanationSchema.partial({ pageKind: true }).safeParse(source.explanation);
  if (!parsed.success) return;
  return { notes: "", explanation: parsed.data, ...(source.generatedAt ? { generatedAt: source.generatedAt } : {}) };
}
