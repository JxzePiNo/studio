import { z } from "zod";
import { MathValidationError } from "./math-validation";

export const tutorAnswerSchema = z.object({
  verdict: z.enum(["yes", "no", "open", "uncertain"]),
  segments: z.array(z.object({ kind: z.enum(["markdown", "inline_math", "display_math"]), content: z.string() })),
});

export const tutorAnswerInstructions = `Per la risposta testuale usa lo schema strutturato richiesto. Se la domanda ammette un sì/no, verdict deve essere yes o no: la risposta inizierà automaticamente con Sì. o No., seguiti dalla spiegazione. Non ripetere il verdetto nei segmenti. Non forzare un sì/no falso: usa uncertain se i dati non bastano o la risposta dipende da condizioni non specificate, open per domande aperte; in questi casi inizia i segmenti con una risposta diretta e breve, poi spiega. Ogni formula deve essere un segmento inline_math o display_math con solo LaTeX, senza delimitatori $; il testo va in segmenti markdown. Mantieni nei segmenti markdown spazi e a capo necessari fra testo e formule. Non spezzare una formula tra segmenti. Non includere formule in backtick o codice. Usa solo comandi supportati da KaTeX, senza macro personalizzate. Le chiamate agli strumenti restano disponibili per creare quiz e materiali.`;

export function renderTutorAnswer(value: unknown) {
  const parsed = tutorAnswerSchema.safeParse(value);
  if (!parsed.success || !parsed.data.segments.length) throw new MathValidationError(["Risposta strutturata incompleta."]);
  const { verdict, segments } = parsed.data;
  const body = segments.map(segment => {
    if (segment.kind === "markdown") return segment.content;
    if (!segment.content.trim() || /(?<!\\)\$/.test(segment.content)) throw new MathValidationError(["Segmento matematico vuoto o con delimitatori duplicati."]);
    return segment.kind === "inline_math" ? `$${segment.content}$` : `\n\n$$\n${segment.content}\n$$\n\n`;
  }).join("").trim();
  if (!body) throw new MathValidationError(["Risposta vuota."]);
  return (verdict === "yes" ? "Sì.\n\n" : verdict === "no" ? "No.\n\n" : "") + body;
}

