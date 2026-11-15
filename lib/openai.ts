import { meteredFetch } from "./ai-metering";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { analysisExplanationSchema } from "./schema";
import { formatStudyContext, graduateTutorInstructions, type TutorStudyContext } from "./tutor-context";
import { resetMilliseconds, retryAfterMilliseconds } from "./retry-after";

const mathematicalGlossaryInstructions = `Per i simboli usa un approccio da libro di matematica universitario: simbolo (pronuncia o lettura in italiano), poi che cosa rappresenta nel contesto preciso della slide. In glossary.word scrivi il simbolo in LaTeX seguito dalla pronuncia tra parentesi, ad esempio α (alfa), λ (lambda), xᵢ (ics con indice i), ∂f/∂x (derivata parziale di effe rispetto a ics); rendi la notazione con LaTeX, non con questi esempi Unicode. In glossary.translation definisci l'oggetto matematico: scalare, vettore, matrice, insieme, funzione, parametro, variabile, indice oppure operatore. In glossary.context spiega il suo ruolo nella formula e, quando determinabili, dominio, dimensioni o unità di misura e condizioni di utilizzo. Chiarisci anche indici, pedici, apici, accenti, quantificatori e operatori necessari a leggere la formula; distingui simboli simili con significati diversi. Per una formula completa aggiungi come si legge e che relazione esprime; spiega i simboli rilevanti in voci dedicate o nel suo contesto, senza lasciarli impliciti per rispettare il numero indicativo di voci. Anche nella spiegazione principale, alla prima comparsa di una notazione non ovvia, introduci nome e significato prima di usarla nei passaggi. Mantieni rigore e chiarezza, senza dare per scontata la notazione. Non assegnare ai simboli un significato convenzionale se la slide li usa diversamente; se il significato non è ricavabile, dichiaralo invece di inventarlo. Gli esempi di formato non sono voci da aggiungere: includi solo i simboli pertinenti alla slide.`;

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
    max_output_tokens: 12000,
    instructions: `Prima classifica la pagina in pageKind: cover (copertina con titolo/autori/istituzione), index (indice o elenco di argomenti senza spiegazioni), title (solo titolo o separatore), content (contenuti didattici reali, incluse figure, formule o diagrammi anche con poco testo). Per cover/index/title NON sviluppare gli argomenti annunciati: restituisci solo title fedele al documento, language e overview con una breve classificazione; concepts e glossary vuoti, example e takeaway vuoti. Non inventare una lezione a partire da un titolo. Le istruzioni di approfondimento seguenti valgono SOLO per content.\n${graduateTutorInstructions}\nSpiega in modo approfondito la singola slide allegata, inclusi grafici e formule leggibili. Il campo language indica la lingua originale (en, it, other). Per ogni slide content, indipendentemente dalla lingua, glossary raccoglie da 3 a 12 voci utili a comprenderla (meno se il contenuto non ne giustifica altre): termini tecnici, simboli e grandezze, formule e concetti o prerequisiti da cui derivano i passaggi della slide. Ogni voce deve essere collegata a un elemento visibile o a un prerequisito strettamente necessario; non aggiungere argomenti generici o formule non leggibili. word contiene il termine, simbolo o formula; translation contiene una breve definizione in italiano (per un termine straniero includi anche la traduzione); context spiega il ruolo nella slide, il concetto da cui deriva o la relazione con gli altri elementi. Per le formule chiarisci il significato dei simboli, la relazione di partenza e le condizioni di applicazione, solo se ricavabili con sicurezza; per i termini indica il concetto di origine quando aiuta la comprensione. Non limitarti a tradurre parole inglesi e non duplicare l'intera spiegazione. ${mathematicalGlossaryInstructions} title è il titolo italiano. overview presenta il problema, i prerequisiti, la logica complessiva e il significato della slide. concepts sviluppa fino a 8 concetti rilevanti, con definizioni, passaggi espliciti, assunzioni, interpretazione e limiti; se opportuno includi una sezione di collegamenti e una di errori comuni o domande d'esame con risposta. example è un esempio aggiuntivo svolto, con dati, procedimento e interpretazione, distinto dal contenuto originale. takeaway sintetizza ciò che lo studente deve saper spiegare e le condizioni essenziali da ricordare. Nei campi overview, concepts.explanation, example e takeaway puoi usare Markdown per grassetto, elenchi e formule LaTeX tra $ oppure $$ su righe separate; evita di ripetere i titoli delle sezioni. I titoli restano testo semplice; nei campi glossary.word, glossary.translation e glossary.context puoi usare Markdown e LaTeX tra $ oppure $$ per rendere formule e simboli. Non racchiudere i campi in blocchi di codice e non usare HTML. Dai la profondità necessaria a una preparazione magistrale, evitando ripetizioni e riempitivi.`,
    input: [{ role: "user", content: [
      { type: "input_file", filename: `slide-${page}.pdf`, file_data: `data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}` },
      { type: "input_text", text: `Spiega questa slide (pagina ${page} del documento).\n${formatStudyContext(context)}` },
    ] }],
    text: { format: zodTextFormat(analysisExplanationSchema, "slide_explanation") },
  });
  if (response.status !== "completed" || !response.output_parsed) {
    const refused = response.output.some(item => item.type === "message" && item.content.some(part => part.type === "refusal"));
    throw Object.assign(new Error(refused ? "L’AI non può analizzare questa pagina. Prova un’altra slide." : "L’AI ha restituito una risposta incompleta. Riprova."), { retryable: !refused });
  }
  const explanation = analysisExplanationSchema.parse(response.output_parsed);
  return explanation;
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
