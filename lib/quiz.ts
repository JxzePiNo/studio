import { z } from "zod";

export const quizTimingSchema = z.object({ mode: z.enum(["question", "total"]), seconds: z.number().int().min(1).max(86400) }).strict();
export type QuizTiming = z.infer<typeof quizTimingSchema>;

export const quizConfigSchema = z.object({
  count: z.number().int().min(1).max(30),
  openCount: z.number().int().min(0).max(30),
  trueFalseCount: z.number().int().min(0).max(30),
  topics: z.array(z.string().trim().min(1).max(200)).max(30),
  difficulty: z.enum(["base", "intermedia", "avanzata"]).default("avanzata"),
  timing: quizTimingSchema.nullable().optional(),
  throughPage: z.number().int().positive().optional(),
}).strict().refine(value => value.openCount + value.trueFalseCount <= value.count, "Le tipologie superano il totale delle domande.");
export type QuizConfig = z.infer<typeof quizConfigSchema>;

export const generatedQuizSchema = z.object({
  title: z.string().min(1).max(200),
  questions: z.array(z.object({
    type: z.enum(["multiple-choice", "open", "true-false"]),
    question: z.string().min(1).max(1600),
    topic: z.string().min(1).max(200),
    page: z.number().int().positive(),
    options: z.array(z.string().min(1).max(500)).max(4),
    correctIndex: z.number().int().min(0).max(3).nullable(),
    modelAnswer: z.string().max(2500),
    explanation: z.string().min(1).max(2500),
  })).min(1).max(30),
});
export type StudyQuiz = z.infer<typeof generatedQuizSchema> & { id: string; documentId: string; documentName: string; createdAt: string; topics: string[]; timing?: QuizTiming; difficulty?: QuizConfig["difficulty"] };
export type QuizSummary = Pick<StudyQuiz, "id" | "title" | "documentId" | "createdAt"> & { questionCount: number };

export function quizGenerationSchema(config: QuizConfig, pages: number) {
  const base = generatedQuizSchema.shape.questions.element.extend({ page: z.number().int().min(1).max(pages).describe("Indice fisico nel PDF allegato, contando da 1. Ignora la numerazione stampata nel testo.") });
  const variants = [];
  if (config.count > config.openCount + config.trueFalseCount) variants.push(base.extend({ type: z.literal("multiple-choice"), options: z.array(z.string().min(1).max(500)).length(4), correctIndex: z.number().int().min(0).max(3) }));
  if (config.openCount) variants.push(base.extend({ type: z.literal("open"), options: z.array(z.string()).length(0), correctIndex: z.null(), modelAnswer: z.string().min(1).max(2500) }));
  if (config.trueFalseCount) variants.push(base.extend({ type: z.literal("true-false"), options: z.array(z.string().min(1).max(500)).length(2), correctIndex: z.number().int().min(0).max(1) }));
  const question = variants.length === 1 ? variants[0] : z.union(variants);
  return generatedQuizSchema.extend({ questions: z.array(question).length(config.count) });
}

export function validateGeneratedQuiz(value: unknown, config: QuizConfig, pages: number) {
  const quiz = generatedQuizSchema.parse(value);
  if (quiz.questions.length !== config.count || quiz.questions.filter(question => question.type === "open").length !== config.openCount || quiz.questions.filter(question => question.type === "true-false").length !== config.trueFalseCount) throw new Error("Il quiz non rispetta il numero e le tipologie richieste. Riprova.");
  for (const question of quiz.questions) {
    if (question.page > Math.min(pages, config.throughPage ?? pages)) throw new Error("Il quiz contiene riferimenti a pagine fuori dall'ambito selezionato. Riprova.");
    if (question.type === "open") {
      if (question.options.length || question.correctIndex !== null || !question.modelAnswer.trim()) throw new Error("Risposta aperta incompleta. Riprova.");
    } else if (question.options.length !== (question.type === "true-false" ? 2 : 4) || question.correctIndex === null || question.correctIndex >= question.options.length || new Set(question.options.map(option => option.trim().toLocaleLowerCase())).size !== question.options.length) throw new Error("Le opzioni del quiz non sono valide. Riprova.");
  }
  return quiz;
}

export function quizRequestSummary(config: QuizConfig) {
  return `Genera un quiz ${config.throughPage ? `dalla pagina 1 alla pagina ${config.throughPage} del PDF` : "sul PDF"}: ${config.count} domande (${config.count - config.openCount - config.trueFalseCount} a scelta multipla, ${config.openCount} aperte, ${config.trueFalseCount} vero/falso). Argomenti: ${config.topics.join(", ") || (config.throughPage ? "quanto studiato fino alla pagina attuale" : "tutto il PDF")}. Difficoltà: ${config.difficulty}. ${config.timing ? `Timer: ${config.timing.seconds} secondi ${config.timing.mode === "question" ? "per domanda" : "totali"}.` : "Senza timer."}`;
}

export function quickQuizConfig(page: number, timing?: QuizTiming | null): QuizConfig {
  return quizConfigSchema.parse({ count: 10, openCount: 0, trueFalseCount: 0, difficulty: "avanzata", topics: [], throughPage: page, ...(timing ? { timing } : {}) });
}
