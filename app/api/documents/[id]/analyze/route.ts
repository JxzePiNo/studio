import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { extractAnalysisPage } from "@/lib/analysis-pdf";
import { z } from "zod";
import { readDocument, readPdf, updateSlide } from "@/lib/store";
import { explainSlide, openaiError, retryableAnalysisError, analysisRetryHeaders } from "@/lib/openai";
import { apiError, requestGuard } from "@/lib/http";
import { getStudyProfile } from "@/lib/study-profile";
import { getFolder } from "@/lib/folders";
export const runtime = "nodejs";
export const maxDuration = 180;
const inFlight = new Set<string>();
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requestGuard(request); if (denied) return denied;
  let lock: string | undefined;
  try {
    const input = z.object({ page: z.number().int().positive(), regenerate: z.boolean().optional() }).safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: "Pagina non valida." }, { status: 400 });
    const { id } = await params;
    const { page, regenerate } = input.data;
    const doc = await readDocument(id);
    if (page > doc.pages) return NextResponse.json({ error: "Pagina non valida." }, { status: 400 });
    if (doc.slides[page]?.explanation && !regenerate) return NextResponse.json(doc.slides[page]);
    if (!process.env.OPENAI_API_KEY?.trim()) return NextResponse.json({ error: "Aggiungi OPENAI_API_KEY in .env.local e riavvia il server per generare le spiegazioni.", retryable: false }, { status: 503 });
    const lockId = `${id}:${page}`;
    if (inFlight.has(lockId)) return NextResponse.json({ error: "Questa slide è già in analisi. Attendi qualche secondo." }, { status: 409 });
    lock = lockId; inFlight.add(lock);
    const session = createHash("sha256").update(request.headers.get("authorization") || process.env.DATA_DIR || "local").digest("hex");
    const single = await extractAnalysisPage(`${session}:${id}`, page, () => readPdf(id));
    let explanation;
    try {
      const [profile, folder] = await Promise.all([getStudyProfile(), getFolder(doc.folderId)]);
      explanation = await explainSlide(single, page, { studyProgram: profile.studyProgram, courseName: folder?.name, documentName: doc.name });
    }
    catch (e) {
      const known = openaiError(e);
      const retryable = retryableAnalysisError(e);
      if (known) return NextResponse.json({ error: known.error, retryable }, { status: known.status, headers: analysisRetryHeaders(e) });
      return NextResponse.json({ error: e instanceof Error && e.message.startsWith("L’AI") ? e.message : "La risposta AI non è valida. Riprova.", retryable }, { status: 502 });
    }
    const updated = await updateSlide(id, page, slide => ({ ...slide, explanation, generatedAt: new Date().toISOString() }));
    return NextResponse.json(updated);
  } catch (e) { return apiError(e); }
  finally { if (lock) inFlight.delete(lock); }
}
