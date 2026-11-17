import { z } from "zod";

export const explanationSchema = z.object({
  title: z.string().min(1).max(300),
  language: z.enum(["en", "it", "other"]),
  overview: z.string().min(1).max(12000),
  concepts: z.array(z.object({ title: z.string().max(300), explanation: z.string().max(6000) })).max(12),
  example: z.string().max(6000),
  takeaway: z.string().max(3000),
  glossary: z.array(z.object({ word: z.string().max(200), translation: z.string().max(400), context: z.string().max(1000) })).max(30),
});

export const analysisExplanationSchema = explanationSchema.extend({
  pageKind: z.enum(["content", "cover", "index", "title", "blank"]),
});

/** Generation limits are separate so older, longer saved analyses remain readable. */
export const conciseAnalysisExplanationSchema = analysisExplanationSchema.extend({
  title: z.string().min(1).max(180),
  overview: z.string().min(1).max(600),
  concepts: z.array(z.object({ title: z.string().max(120), explanation: z.string().max(600) })).max(3),
  example: z.string().max(400),
  takeaway: z.string().max(200),
  glossary: z.array(z.object({ word: z.string().max(100), translation: z.string().max(180), context: z.string().max(240) })).max(4),
});
