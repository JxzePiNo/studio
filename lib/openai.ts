import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { explanationSchema } from "./schema";
import { formatStudyContext, graduateTutorInstructions, type TutorStudyContext } from "./tutor-context";

export async function explainSlide(bytes: Uint8Array, page: number, context: TutorStudyContext = {}) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 150000, maxRetries: 0 });
  const response = await client.responses.parse({
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    store: false,
    max_output_tokens: 12000,
    instructions: `${graduateTutorInstructions}\nSpiega in modo approfondito la singola slide allegata, inclusi grafici e formule leggibili. Il campo language indica la lingua originale (en, it, other). Se è inglese, glossary deve contenere da 5 a 15 termini importanti realmente presenti con traduzione italiana e contesto; altrimenti deve essere vuoto. title è il titolo italiano. overview presenta il problema, i prerequisiti, la logica complessiva e il significato della slide. concepts sviluppa fino a 8 concetti rilevanti, con definizioni, passaggi espliciti, assunzioni, interpretazione e limiti; se opportuno includi una sezione di collegamenti e una di errori comuni o domande d'esame con risposta. example è un esempio aggiuntivo svolto, con dati, procedimento e interpretazione, distinto dal contenuto originale. takeaway sintetizza ciò che lo studente deve saper spiegare e le condizioni essenziali da ricordare. Nei campi overview, concepts.explanation, example e takeaway puoi usare Markdown per grassetto, elenchi e formule LaTeX tra $ oppure $$ su righe separate; evita di ripetere i titoli delle sezioni. Titoli e glossario restano testo semplice. Non racchiudere i campi in blocchi di codice e non usare HTML. Dai la profondità necessaria a una preparazione magistrale, evitando ripetizioni e riempitivi.`,
    input: [{ role: "user", content: [
      { type: "input_file", filename: `slide-${page}.pdf`, file_data: `data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}` },
      { type: "input_text", text: `Spiega questa slide (pagina ${page} del documento).\n${formatStudyContext(context)}` },
    ] }],
    text: { format: zodTextFormat(explanationSchema, "slide_explanation") },
  });
  if (response.status !== "completed" || !response.output_parsed) {
    const refused = response.output.some(item => item.type === "message" && item.content.some(part => part.type === "refusal"));
    throw new Error(refused ? "L’AI non può analizzare questa pagina. Prova un’altra slide." : "L’AI ha restituito una risposta incompleta. Riprova.");
  }
  const explanation = explanationSchema.parse(response.output_parsed);
  if (explanation.language !== "en") explanation.glossary = [];
  return explanation;
}

export function openaiError(error: unknown): { error: string; status: number } | undefined {
  if (error instanceof OpenAI.APIConnectionError) return { error: "Connessione a OpenAI non riuscita o tempo scaduto. Riprova.", status: 504 };
  if (error instanceof OpenAI.APIError) {
    const message = error.status === 429 ? "Limite API raggiunto. Attendi e riprova, oppure controlla quota e fatturazione su OpenAI Platform." : error.status === 401 || error.status === 403 ? "Controlla la chiave OpenAI e i permessi del progetto." : error.status === 400 || error.status === 404 ? "Controlla che OPENAI_MODEL sia disponibile e supporti PDF e risposte strutturate." : "OpenAI non è disponibile. Riprova tra poco.";
    return { error: message, status: 502 };
  }
}
