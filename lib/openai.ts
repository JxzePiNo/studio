import { createHash } from "node:crypto";
import { meteredFetch } from "./ai-metering";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { conciseAnalysisExplanationSchema } from "./schema";
import { formatStudyContext, type TutorStudyContext } from "./tutor-context";
import { slideInstructions } from "./slide-explanation-instructions";
import { resetMilliseconds, retryAfterMilliseconds } from "./retry-after";
import { validateGeneratedMath } from "./validated-math-output";

export const analysisPromptSignature = createHash("sha256").update(slideInstructions).digest("hex");

export function analysisRetryHeaders(error: unknown): Record<string, string> {
  if (!(error instanceof OpenAI.APIError) || !retryableAnalysisError(error)) return {};
  const headers: Record<string, string> = {};
  if (error.status === 429) headers["X-Analysis-Rate-Limited"] = "true";
  const explicit = retryAfterMilliseconds(error.headers?.get("retry-after") ?? null);
  const milliseconds = Number(error.headers?.get("retry-after-ms"));
  const resets = error.status === 429 ? ["requests", "tokens", "project-tokens"].flatMap(kind => {
    const remaining = error.headers?.get(`x-ratelimit-remaining-${kind}`);
    const reset = resetMilliseconds(error.headers?.get(`x-ratelimit-reset-${kind}`) ?? null);
    return remaining !== null && remaining !== undefined && Number(remaining) <= 0 && reset !== undefined ? [reset] : [];
  }) : [];
  const delay = Math.max(explicit ?? 0, Number.isFinite(milliseconds) ? milliseconds : 0, ...resets);
  if (delay > 0) headers["Retry-After"] = String(Math.ceil(delay / 1000));
  return headers;
}

export async function explainSlide(bytes: Uint8Array, page: number, context: TutorStudyContext = {}) {
  const client = new OpenAI({ fetch: meteredFetch("analysis"), apiKey: process.env.OPENAI_API_KEY, timeout: 150000, maxRetries: 0 });
  const response = await client.responses.parse({
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    store: false,
    max_output_tokens: 2000,
    instructions: slideInstructions,
    input: [{ role: "user", content: [
      { type: "input_file", filename: `slide-${page}.pdf`, file_data: `data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}` },
      { type: "input_text", text: `Spiega questa slide (pagina ${page} del documento).\n${formatStudyContext(context)}` },
    ] }],
    text: { format: zodTextFormat(conciseAnalysisExplanationSchema, "slide_explanation") },
  });
  if (response.status !== "completed" || !response.output_parsed) {
    const refused = response.output.some(item => item.type === "message" && item.content.some(part => part.type === "refusal"));
    throw Object.assign(new Error(refused ? "L’AI non può analizzare questa pagina. Prova un’altra slide." : "L’AI ha restituito una risposta incompleta. Riprova."), { retryable: !refused });
  }
  const explanation = conciseAnalysisExplanationSchema.parse(response.output_parsed);
  return conciseAnalysisExplanationSchema.parse(await validateGeneratedMath(explanation, client));
}

export function retryableAnalysisError(error: unknown): boolean {
  if (error instanceof OpenAI.APIConnectionError) return true;
  if (error instanceof OpenAI.APIError) {
    if (error.code === "insufficient_quota") return false;
    return error.status !== undefined && [408, 409, 429, 500, 502, 503, 504].includes(error.status);
  }
  return !(error && typeof error === "object" && "retryable" in error && error.retryable === false);
}

export function openaiError(error: unknown): { error: string; status: number } | undefined {
  if (error instanceof OpenAI.APIConnectionError) return { error: "Connessione a OpenAI non riuscita o tempo scaduto. Riprova.", status: 504 };
  if (error instanceof OpenAI.APIError) {
    const message = error.status === 429 ? "Limite API raggiunto. Attendi e riprova, oppure controlla quota e fatturazione su OpenAI Platform." : error.status === 401 || error.status === 403 ? "Controlla la chiave OpenAI e i permessi del progetto." : error.status === 400 || error.status === 404 ? "Controlla che OPENAI_MODEL sia disponibile e supporti PDF e risposte strutturate." : "OpenAI non è disponibile. Riprova tra poco.";
    return { error: message, status: 502 };
  }
}
