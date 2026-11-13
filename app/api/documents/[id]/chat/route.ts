import { POST as createVisualization } from "../visualizations/route";
import { crossChatContext } from "@/lib/cross-chat-context";
import { recordQuestion } from "@/lib/question-log";
import { meteredFetch } from "@/lib/ai-metering";
import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import OpenAI from "openai";
import { z } from "zod";
import { apiError, requestGuard } from "@/lib/http";
import { listDocuments, readDocument, readPdf, updateSlide } from "@/lib/store";
import { openaiError } from "@/lib/openai";
import { getStudyProfile } from "@/lib/study-profile";
import { getFolder } from "@/lib/folders";
import { formatStudyContext, graduateTutorInstructions } from "@/lib/tutor-context";
import { quizConfigSchema } from "@/lib/quiz";
import { generateQuiz, quizTool } from "@/lib/quiz-generation";
import { saveQuiz } from "@/lib/quiz-store";
import { boundedChatHistory, withAnalysisMessage } from "@/lib/analysis-chat";
import { chatLearningContext, learningContextInstructions, priorReadPages } from "@/lib/chat-learning-context";
export const runtime = "nodejs";
export const maxDuration = 300;
const input = z.object({ page: z.number().int().positive(), question: z.string().trim().min(1).max(4000), scope: z.enum(["slide", "document", "exam"]), quiz: quizConfigSchema.optional() });
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requestGuard(request); if (denied) return denied;
  try {
    const parsed = input.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Domanda non valida." }, { status: 400 });
    const { page, question, scope } = parsed.data;
    const { id } = await params;
    const doc = await readDocument(id);
    if (page > doc.pages) return NextResponse.json({ error: "Slide non valida." }, { status: 400 });
    if (!process.env.OPENAI_API_KEY?.trim()) return NextResponse.json({ error: "Configura OPENAI_API_KEY per usare la chat." }, { status: 503 });
    await recordQuestion(id, page, question);
    const originalBytes = await readPdf(id);
    const [profile, folder] = await Promise.all([getStudyProfile(), getFolder(doc.folderId)]);
    const studyContext = formatStudyContext({ studyProgram: profile.studyProgram, courseName: folder?.name, documentName: doc.name });
    const createQuiz = async (configuration: unknown, signal = request.signal) => {
      const checked = quizConfigSchema.safeParse(configuration);
      if (!checked.success) return NextResponse.json({ error: "Scegli da 1 a 30 domande e tipologie compatibili con il totale." }, { status: 400 });
      const quiz = await generateQuiz(doc, originalBytes, checked.data, studyContext, signal);
      signal.throwIfAborted();
      await saveQuiz(id, quiz);
      const updated = await updateSlide(id, page, slide => ({ ...slide, chat: boundedChatHistory([...(slide.chat || []), { role: "user", content: question }, { role: "assistant", content: `Quiz pronto: ${quiz.title}. Lo trovi sotto il PDF nei materiali del corso.` }]) }));
      return NextResponse.json(updated.chat, { headers: { "X-Studio-Quiz-Id": quiz.id } });
    };
    if (parsed.data.quiz) return await createQuiz(parsed.data.quiz);

    const previousPages = priorReadPages(doc, page).slice(-20);
    const attachedPages = [...previousPages, page];
    let attachment: Uint8Array;
    if (scope === "document") attachment = originalBytes;
    else {
      const original = await PDFDocument.load(originalBytes);
      const single = await PDFDocument.create();
      const copied = await single.copyPages(original, attachedPages.map(number => number - 1));
      for (const copiedPage of copied) single.addPage(copiedPage);
      attachment = await single.save();
    }
    let context = "";
    const materials = scope === "exam" && doc.folderId ? [doc, ...(await listDocuments()).filter(d => d.folderId === doc.folderId && d.id !== doc.id)] : [doc];
    // Bound context and database reads. The tutor explicitly reports incomplete coverage.
    for (const item of materials.slice(0, 20)) {
      const material = item.id === id ? doc : await readDocument(item.id);
      for (const [number, slide] of Object.entries(material.slides)) {
        if (scope === "slide" && Number(number) !== page) continue;
        context += `\n[${material.name}, slide ${number}]\n${JSON.stringify({ explanation: slide.explanation, notes: slide.notes })}\n`;
        if (context.length >= 60000) break;
      }
      if (context.length >= 60000) break;
    }
    const memory = await crossChatContext(doc);
    const history = withAnalysisMessage(doc.slides[page]?.explanation, (doc.slides[page]?.chat || []).slice(-12));
    const client = new OpenAI({ fetch: meteredFetch("chat"), apiKey: process.env.OPENAI_API_KEY, timeout: 150000, maxRetries: 0 });
    const parameters: OpenAI.Responses.ResponseCreateParamsNonStreaming = {
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini", store: false, max_output_tokens: 7000, tools: [quizTool, { type: "function", name: "create_material", description: "Genera e salva subito un'immagine, un'immagine interattiva, una mappa o uno schema richiesti dallo studente. Usa la cronologia per risolvere riferimenti e chiarimenti.", strict: true, parameters: { type: "object", properties: { kind: { type: "string", enum: ["image", "map", "diagram"] }, interactive: { type: "boolean", description: "True solo se richiesta un'immagine interattiva con punti esplorabili." }, question: { type: "string", description: "Richiesta completa, integrando i chiarimenti gia ricevuti e i dati del contesto." }, scope: { type: "string", enum: ["slide", "document"] } }, required: ["kind", "interactive", "question", "scope"], additionalProperties: false } }], parallel_tool_calls: false,
      instructions: `${graduateTutorInstructions}\n${learningContextInstructions}\nQuando viene chiesto in linguaggio naturale di generare un'immagine, una mappa o uno schema, esegui create_material; non limitarti a promettere di farlo o a scrivere codice Python. Per immagine di un grafico usa kind image; per immagine interattiva usa image e interactive true. Per mappe usa map, per schemi diagram. Se mancano dati indispensabili (per esempio funzione, valori o soggetto non ricavabili dal contesto), fai una domanda precisa e, ricevuta la risposta, genera. Non inventare dati numerici. Non chiamare strumenti per semplici domande su come funzionano questi materiali. Non dichiarare di aver eseguito Python: non e disponibile.\nSe l'utente chiede di creare un quiz, usa create_quiz: il quiz riguarda il PDF completo anche quando il contesto chat è una singola pagina. Rispetta quantità, domande aperte/chiuse/vero-falso e argomenti; se chiede più di 30 domande spiega il limite per singolo quiz. Se mancano preferenze, scegli 10 domande a scelta multipla. Non usare il tool per una semplice spiegazione o per risolvere domande già presenti.\nLa spiegazione salvata della slide è il primo intervento del tutor: continua da lì senza ripeterla integralmente se la domanda riguarda un dettaglio. Rispondi in modo ampio e approfondito alle domande concettuali; per chiarimenti circoscritti concentrati sul punto richiesto senza perdere rigore. Cita nome documento e numero pagina per i riferimenti al materiale. ${scope === "document" ? "È allegato l'intero PDF aperto, con tutte le pagine comprese quelle non ancora analizzate. Puoi collegare queste pagine; la pagina selezionata è indicata nella domanda. Non sono allegati gli altri PDF del corso." : "Sono allegate la slide selezionata e fino a 20 pagine precedenti segnate come lette, nei numeri originali elencati nel contesto. Usa queste ultime come supporto e mantieni il focus sulla domanda relativa alla slide selezionata. Non dichiarare di aver letto il resto del PDF."} L'eventuale contesto aggiuntivo contiene solo spiegazioni e appunti salvati e può essere parziale o troncato: non dichiarare di aver letto altri PDF. Formatta la risposta in Markdown leggibile: usa titoli, paragrafi brevi, grassetto per i termini chiave, elenchi quando aiutano e tabelle solo per confronti. Usa blocchi di codice con il linguaggio indicato. Scrivi le formule LaTeX tra $ per quelle inline e tra $$ su righe separate per quelle in evidenza. Non racchiudere tutta la risposta in un blocco di codice e non usare HTML.`,
      input: [{ role: "user", content: [
        { type: "input_file", filename: scope === "document" ? "documento-completo.pdf" : `slide-${page}.pdf`, file_data: `data:application/pdf;base64,${Buffer.from(attachment).toString("base64")}` },
        { type: "input_text", text: `${studyContext}\nDocumento: ${doc.name}, slide ${page}. Ambito: ${scope}.\nPagine originali allegate, in ordine: ${scope === "document" ? "tutte le pagine del PDF" : attachedPages.join(", ")}.\n${chatLearningContext(doc, page)}\n${memory}\nMateriale disponibile:\n${context.slice(0,60000)}\nCronologia (include la spiegazione iniziale, se disponibile):\n${JSON.stringify(history)}\nDomanda: ${question}` },
      ] }],
    };
    const finish = async (response: OpenAI.Responses.Response, signal = request.signal) => {
    const material = response.output.find(item => item.type === "function_call" && item.name === "create_material");
    if (response.status === "completed" && material?.type === "function_call") {
      let configuration: unknown;
      try { configuration = JSON.parse(material.arguments); }
      catch { return NextResponse.json({ error: "Richiesta di generazione incompleta. Riprova." }, { status: 502 }); }
      const config = z.object({ kind: z.enum(["image", "map", "diagram"]), interactive: z.boolean(), question: z.string().trim().min(1).max(4000), scope: z.enum(["slide", "document"]) }).safeParse(configuration);
      if (!config.success) return NextResponse.json({ error: "Richiesta di generazione incompleta. Riprova." }, { status: 502 });
      return createVisualization(new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify({ ...config.data, page }), signal }), { params: Promise.resolve({ id }) });
    }
    const tool = response.output.find(item => item.type === "function_call" && item.name === "create_quiz");
    if (response.status === "completed" && tool?.type === "function_call") {
      let configuration;
      try { configuration = JSON.parse(tool.arguments); } catch { return NextResponse.json({ error: "Configurazione del quiz incompleta. Riprova." }, { status: 502 }); }
      return await createQuiz(configuration, signal);
    }
    const outputText = response.output_text || response.output.filter(item => item.type === "message").flatMap(item => item.content.filter(part => part.type === "output_text").map(part => part.text)).join("");
    if (response.status !== "completed" || !outputText.trim()) return NextResponse.json({ error: "Risposta incompleta. Riprova." }, { status: 502 });
    signal.throwIfAborted();
    const messages = [{ role: "user" as const, content: question }, { role: "assistant" as const, content: outputText }];
    const updated = await updateSlide(id, page, slide => ({ ...slide, chat: boundedChatHistory([...(slide.chat || []), ...messages]) }));
    return NextResponse.json(updated.chat);
    };
    if (!request.headers.get("accept")?.includes("text/event-stream")) {
      return await finish(await client.responses.create(parameters, { signal: request.signal }));
    }
    const abort = new AbortController();
    const onAbort = () => abort.abort();
    request.signal.addEventListener("abort", onAbort, { once: true });
    if (request.signal.aborted) abort.abort();
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (event: string, data: unknown) => {
          if (!abort.signal.aborted) controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };
        try {
          const upstream = await client.responses.create({ ...parameters, stream: true }, { signal: abort.signal });
          let completed: OpenAI.Responses.Response | undefined;
          let quizStarted = false;
          for await (const event of upstream) {
            if (abort.signal.aborted) break;
            if (event.type === "response.output_text.delta") emit("delta", { text: event.delta });
            if (event.type === "response.output_item.added" && event.item.type === "function_call" && event.item.name === "create_material") emit("material-start", { arguments: "", kind: "pending" });
            if (event.type === "response.function_call_arguments.done") {
              const item = (() => { try { return JSON.parse(event.arguments); } catch { return null; } })();
              if (item?.kind) emit("material-start", { kind: item.kind });
            }
            if (event.type === "response.output_item.added" && event.item.type === "function_call" && event.item.name === "create_quiz") {
              quizStarted = true;
              emit("quiz-start", { documentId: id });
            }
            if (event.type === "response.completed") completed = event.response;
            if (event.type === "response.failed" || event.type === "response.incomplete" || event.type === "error") {
              throw Object.assign(new Error("Risposta incompleta. Riprova."), { status: 502 });
            }
          }
          if (abort.signal.aborted) return;
          if (!completed) throw Object.assign(new Error("Risposta incompleta. Riprova."), { status: 502 });
          if (!quizStarted && completed.output.some(item => item.type === "function_call" && item.name === "create_quiz")) emit("quiz-start", { documentId: id });
          const saved = await finish(completed, abort.signal);
          const data = await saved.json();
          if (!saved.ok) emit("error", { error: data.error, status: saved.status });
          else {
            const quizId = saved.headers.get("X-Studio-Quiz-Id") || undefined;
            if (quizId) emit("quiz", { quizId, documentId: id });
            emit("done", { messages: data, quizId });
          }
        } catch (error) {
          if (!abort.signal.aborted) {
            const known = openaiError(error);
            const safe = known ? { error: known.error, status: known.status } : { ...await apiError(error).json() };
            emit("error", safe);
          }
        } finally {
          request.signal.removeEventListener("abort", onAbort);
          if (!abort.signal.aborted) controller.close();
        }
      },
      cancel() { abort.abort(); request.signal.removeEventListener("abort", onAbort); },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
  } catch(e) { const known = openaiError(e); return known ? NextResponse.json({ error: known.error }, { status: known.status }) : apiError(e); }
}
