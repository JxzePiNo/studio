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
