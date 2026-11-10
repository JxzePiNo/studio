import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import OpenAI from "openai";
import { z } from "zod";
import { apiError, requestGuard } from "@/lib/http";
import { listDocuments, readDocument, readPdf, updateDocument } from "@/lib/store";
import { openaiError } from "@/lib/openai";
import { getStudyProfile } from "@/lib/study-profile";
import { listFolders } from "@/lib/folders";
import { formatStudyContext, graduateTutorInstructions } from "@/lib/tutor-context";
import { quizConfigSchema } from "@/lib/quiz";
import { generateQuiz, quizTool } from "@/lib/quiz-generation";
import { saveQuiz } from "@/lib/quiz-store";
import { boundedChatHistory, withAnalysisMessage } from "@/lib/analysis-chat";
export const runtime = "nodejs";
export const maxDuration = 180;
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
    const originalBytes = await readPdf(id);
    const [profile, folders] = await Promise.all([getStudyProfile(), listFolders()]);
    const studyContext = formatStudyContext({ studyProgram: profile.studyProgram, courseName: folders.find(folder => folder.id === doc.folderId)?.name, documentName: doc.name });
    const createQuiz = async (configuration: unknown) => {
      const checked = quizConfigSchema.safeParse(configuration);
      if (!checked.success) return NextResponse.json({ error: "Scegli da 1 a 30 domande e tipologie compatibili con il totale." }, { status: 400 });
      const quiz = await generateQuiz(doc, originalBytes, checked.data, studyContext);
      await saveQuiz(id, quiz);
      const updated = await updateDocument(id, current => {
        const slide = current.slides[page] || { notes: "" };
        current.slides[page] = { ...slide, chat: boundedChatHistory([...(slide.chat || []), { role: "user", content: question }, { role: "assistant", content: `Quiz pronto: ${quiz.title}`, quiz }]) };
      });
      return NextResponse.json(updated.slides[page].chat);
    };
    if (parsed.data.quiz) return await createQuiz(parsed.data.quiz);

    let attachment: Uint8Array;
    if (scope === "document") attachment = originalBytes;
    else {
      const original = await PDFDocument.load(originalBytes);
      const single = await PDFDocument.create();
      const [copied] = await single.copyPages(original, [page - 1]); single.addPage(copied);
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
    const history = withAnalysisMessage(doc.slides[page]?.explanation, (doc.slides[page]?.chat || []).slice(-12));
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 150000, maxRetries: 0 });
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini", store: false, max_output_tokens: 7000, tools: [quizTool], parallel_tool_calls: false,
      instructions: `${graduateTutorInstructions}\nSe l'utente chiede di creare un quiz, usa create_quiz: il quiz riguarda il PDF completo anche quando il contesto chat è una singola pagina. Rispetta quantità, domande aperte/chiuse/vero-falso e argomenti; se chiede più di 30 domande spiega il limite per singolo quiz. Se mancano preferenze, scegli 10 domande a scelta multipla. Non usare il tool per una semplice spiegazione o per risolvere domande già presenti.\nLa spiegazione salvata della slide è il primo intervento del tutor: continua da lì senza ripeterla integralmente se la domanda riguarda un dettaglio. Rispondi in modo ampio e approfondito alle domande concettuali; per chiarimenti circoscritti concentrati sul punto richiesto senza perdere rigore. Cita nome documento e numero pagina per i riferimenti al materiale. ${scope === "document" ? "È allegato l'intero PDF aperto, con tutte le pagine comprese quelle non ancora analizzate. Puoi collegare queste pagine; la pagina selezionata è indicata nella domanda. Non sono allegati gli altri PDF del corso." : "È allegata soltanto la slide selezionata. Non dichiarare di aver letto il resto del PDF."} L'eventuale contesto aggiuntivo contiene solo spiegazioni e appunti salvati e può essere parziale o troncato: non dichiarare di aver letto altri PDF. Formatta la risposta in Markdown leggibile: usa titoli, paragrafi brevi, grassetto per i termini chiave, elenchi quando aiutano e tabelle solo per confronti. Usa blocchi di codice con il linguaggio indicato. Scrivi le formule LaTeX tra $ per quelle inline e tra $$ su righe separate per quelle in evidenza. Non racchiudere tutta la risposta in un blocco di codice e non usare HTML.`,
      input: [{ role: "user", content: [
        { type: "input_file", filename: scope === "document" ? "documento-completo.pdf" : `slide-${page}.pdf`, file_data: `data:application/pdf;base64,${Buffer.from(attachment).toString("base64")}` },
        { type: "input_text", text: `${studyContext}\nDocumento: ${doc.name}, slide ${page}. Ambito: ${scope}.\nMateriale disponibile:\n${context.slice(0,60000)}\nCronologia (include la spiegazione iniziale, se disponibile):\n${JSON.stringify(history)}\nDomanda: ${question}` },
      ] }],
    });
    const tool = response.output.find(item => item.type === "function_call" && item.name === "create_quiz");
    if (response.status === "completed" && tool?.type === "function_call") {
      let configuration;
      try { configuration = JSON.parse(tool.arguments); } catch { return NextResponse.json({ error: "Configurazione del quiz incompleta. Riprova." }, { status: 502 }); }
      return await createQuiz(configuration);
    }
    if (response.status !== "completed" || !response.output_text?.trim()) return NextResponse.json({ error: "Risposta incompleta. Riprova." }, { status: 502 });
    const messages = [{ role: "user" as const, content: question }, { role: "assistant" as const, content: response.output_text }];
    const updated = await updateDocument(id, d => { const slide = d.slides[page] || { notes: "" }; d.slides[page] = { ...slide, chat: boundedChatHistory([...(slide.chat || []), ...messages]) }; });
    return NextResponse.json(updated.slides[page].chat);
  } catch(e) { const known = openaiError(e); return known ? NextResponse.json({ error: known.error }, { status: known.status }) : apiError(e); }
}
