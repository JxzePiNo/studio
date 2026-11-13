import { recordQuestion } from "@/lib/question-log";
import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { z } from "zod";
import { apiError, requestGuard } from "@/lib/http";
import { readDocument, readPdf, updateSlide } from "@/lib/store";
import { getStudyProfile } from "@/lib/study-profile";
import { getFolder } from "@/lib/folders";
import { formatStudyContext } from "@/lib/tutor-context";
import { chatLearningContext } from "@/lib/chat-learning-context";
import { generateArtifact } from "@/lib/artifact-generation";
import { artifactKindSchema, artifactNames, studyArtifactSchema, validateArtifact, validateArtifactPages } from "@/lib/study-artifact";
import { saveArtifactImage, removeArtifactImage } from "@/lib/artifact-images";
import { boundedChatHistory } from "@/lib/analysis-chat";
import { openaiError } from "@/lib/openai";

export const runtime = "nodejs";
export const maxDuration = 300;
const input = z.object({ page: z.number().int().positive(), question: z.string().trim().min(1).max(4000), scope: z.enum(["studied", "slide", "document"]), kind: artifactKindSchema, interactive: z.boolean().optional() }).strict();
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requestGuard(request); if (denied) return denied;
  try {
    const parsed = input.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Indica un concetto da visualizzare (massimo 4.000 caratteri)." }, { status: 400 });
    const { id } = await params;
    const doc = await readDocument(id);
    const { page, question, scope, kind } = parsed.data;
    if (page > doc.pages) return NextResponse.json({ error: "Pagina non valida." }, { status: 400 });
    if (!process.env.OPENAI_API_KEY?.trim()) return NextResponse.json({ error: "Configura OpenAI per creare il materiale." }, { status: 503 });
    await recordQuestion(id, page, question, kind);
    const [profile, folder, original] = await Promise.all([getStudyProfile(), getFolder(doc.folderId), readPdf(id)]);
    let bytes: Uint8Array = original;
    const attachedPageCount = scope === "slide" ? 1 : scope === "studied" ? page : doc.pages;
    if (scope !== "document") {
      const source = await PDFDocument.load(original); const single = await PDFDocument.create();
      const copied = await single.copyPages(source, scope === "slide" ? [page - 1] : Array.from({ length: page }, (_, index) => index));
      for (const copiedPage of copied) single.addPage(copiedPage);
      bytes = await single.save();
    }
    const learningDoc = scope === "studied" ? { ...doc, slides: Object.fromEntries(Object.entries(doc.slides).filter(([number]) => Number(number) <= page)) } : doc;
    const context = `${formatStudyContext({ studyProgram: profile.studyProgram, courseName: folder?.name, documentName: doc.name })}\nPagina selezionata: ${page}. Ambito: ${scope}.\n${chatLearningContext(learningDoc, page)}\nSpiegazione e appunti della pagina (dati): ${JSON.stringify(doc.slides[page] ? { explanation: doc.slides[page].explanation, notes: doc.slides[page].notes } : {}).slice(0, 18000)}`;
    const conversation = (doc.slides[page]?.chat || []).slice(-8).map(message => ({ role: message.role, content: message.content.slice(0, 2000) }));
    const { artifact, imageBytes } = await generateArtifact(bytes, question, `${context}\nDomande e risposte precedenti della pagina (dati): ${JSON.stringify(conversation)}`, kind, request.signal, attachedPageCount, parsed.data.interactive);
    if (artifact.kind !== "image") {
      // References use physical pages in the attached PDF. A single-page
      // attachment is remapped to its original page before saving.
      try { validateArtifactPages(artifact, attachedPageCount); }
      catch { throw Object.assign(new Error("La mappa contiene riferimenti di pagina non validi. Riprova."), { status: 502 }); }
      if (scope === "slide") artifact.nodes = artifact.nodes.map(node => ({ ...node, sourcePage: node.sourcePage == null ? null : page }));
    }
    request.signal.throwIfAborted();
    let savedImage = false;
    try {
      if (artifact.kind === "image" && imageBytes) { await saveArtifactImage(id, artifact.image.assetId, imageBytes); savedImage = true; }
      request.signal.throwIfAborted();
      const updated = await updateSlide(id, page, slide => ({ ...slide, chat: boundedChatHistory([...(slide.chat || []), { role: "user", content: `Crea ${artifactNames[kind].toLowerCase()}: ${question}` }, { role: "assistant", content: `${artifact.title}\n\n${artifact.summary}`, artifact }]) }));
      return NextResponse.json(updated.chat);
    } catch (error) {
      if (savedImage && artifact.kind === "image") await removeArtifactImage(id, artifact.image.assetId).catch(() => {});
      throw error;
    }
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof z.ZodError) return NextResponse.json({ error: "Il materiale restituito è incompleto o non valido. Riprova." }, { status: 502 });
    const known = openaiError(error); return known ? NextResponse.json({ error: known.error }, { status: known.status }) : apiError(error);
  }
}


export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requestGuard(request); if (denied) return denied;
  try {
    const parsed = z.object({ page: z.number().int().positive(), artifact: studyArtifactSchema }).strict().safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Modifiche non valide." }, { status: 400 });
    const { id } = await params;
    const doc = await readDocument(id);
    if (parsed.data.page > doc.pages) return NextResponse.json({ error: "Pagina non valida." }, { status: 400 });
    let artifact;
    try { artifact = validateArtifactPages(validateArtifact(parsed.data.artifact), doc.pages); }
    catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }
    const updated = await updateSlide(id, parsed.data.page, slide => {
      const previous = slide.chat?.find(message => message.artifact?.id === artifact.id)?.artifact;
      if (!previous || previous.kind !== artifact.kind) throw Object.assign(new Error("Materiale non trovato."), { status: 404 });
      if (previous.kind === "image" && artifact.kind === "image" && (previous.image.assetId !== artifact.image.assetId || previous.image.width !== artifact.image.width || previous.image.height !== artifact.image.height)) throw Object.assign(new Error("L'immagine originale non si puo cambiare da questo editor."), { status: 400 });
      return { ...slide, chat: slide.chat!.map(message => message.artifact?.id === artifact.id ? { ...message, content: `${artifact.title}\n\n${artifact.summary}`, artifact } : message) };
    });
    return NextResponse.json(updated.chat);
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requestGuard(request); if (denied) return denied;
  try {
    const parsed = z.object({ page: z.number().int().positive(), artifactId: z.string().uuid() }).strict().safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Materiale non valido." }, { status: 400 });
    const { id } = await params;
    const doc = await readDocument(id);
    if (parsed.data.page > doc.pages) return NextResponse.json({ error: "Pagina non valida." }, { status: 400 });
    let assetId: string | undefined;
    const updated = await updateSlide(id, parsed.data.page, slide => {
      const artifact = slide.chat?.find(message => message.artifact?.id === parsed.data.artifactId)?.artifact;
      if (!artifact) throw Object.assign(new Error("Materiale non trovato."), { status: 404 });
      if (artifact.kind === "image") assetId = artifact.image.assetId;
      return { ...slide, chat: slide.chat!.filter(message => message.artifact?.id !== parsed.data.artifactId) };
    });
    if (assetId && !Object.values(doc.slides).some(slide => slide.chat?.some(message => message.artifact?.id !== parsed.data.artifactId && message.artifact?.kind === "image" && message.artifact.image.assetId === assetId))) {
      await removeArtifactImage(id, assetId).catch(() => { console.warn("Could not remove deleted generation image", { documentId: id, assetId }); });
    }
    return NextResponse.json(updated.chat);
  } catch (error) { return apiError(error); }
}
