import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { extractAnalysisPage } from "@/lib/analysis-pdf";
import { filterAnalysisPage } from "@/lib/analysis-page-filter";
import { z } from "zod";
import { readDocument, readPdf, updateSlide, updateDocument } from "@/lib/store";
import { explainSlide, openaiError, retryableAnalysisError, analysisRetryHeaders, analysisPromptSignature } from "@/lib/openai";
import { pdfHash } from "@/lib/pdf-content";
import { analysisKey, sharedAnalysis } from "@/lib/shared-analysis-cache";
import { apiError, requestGuard } from "@/lib/http";
import { getStudyProfile } from "@/lib/study-profile";
import { getFolder } from "@/lib/folders";
export const runtime = "nodejs";
export const maxDuration = 180;
const inFlight = new Set<string>();
const fingerprints = new Map<string, Promise<string>>();
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
    const lockId = `${id}:${page}`;
    if (inFlight.has(lockId)) return NextResponse.json({ error: "Questa slide è già in analisi. Attendi qualche secondo." }, { status: 409 });
    lock = lockId; inFlight.add(lock);
    const session = createHash("sha256").update(request.headers.get("authorization") || process.env.DATA_DIR || "local").digest("hex");
    let explanation;
    let generatedAt: string;
    try {
      const [profile, folder] = await Promise.all([getStudyProfile(), getFolder(doc.folderId)]);
      let hash = doc.contentHash;
      if (!hash) {
        const identity = `${session}:${id}`;
        let fingerprint = fingerprints.get(identity);
        if (!fingerprint) {
          fingerprint = (async () => { const hash = pdfHash(await readPdf(id)); await updateDocument(id, value => { value.contentHash = hash; }); return hash; })();
          fingerprints.set(identity, fingerprint);
          void fingerprint.finally(() => { if (fingerprints.get(identity) === fingerprint) fingerprints.delete(identity); }).catch(() => {});
        }
        hash = await fingerprint;
      }
      // Names supplied by an owner must not leak through a shared explanation.
      const context = { studyProgram: profile.studyProgram, courseName: folder?.name, documentName: "Materiale PDF" };
      const key = analysisKey(hash, page, process.env.OPENAI_MODEL || "gpt-4.1-mini", analysisPromptSignature, context);
      const result = await sharedAnalysis(key, async () => {
        const single = await extractAnalysisPage(`${session}:${id}`, page, () => readPdf(id));
        // Explicit regeneration also lets the user override a local classification.
        const filtered = !regenerate ? await filterAnalysisPage(single) : undefined;
        if (filtered) return filtered;
        if (!process.env.OPENAI_API_KEY?.trim()) throw Object.assign(new Error("Aggiungi OPENAI_API_KEY in .env.local e riavvia il server per generare le spiegazioni."), { status: 503, retryable: false });
        return explainSlide(single, page, context);
      }, regenerate);
      explanation = result.explanation; generatedAt = result.generatedAt;
    }
    catch (e) {
      if ((e as { status?: number }).status === 503) return NextResponse.json({ error: (e as Error).message, retryable: false }, { status: 503 });
      const known = openaiError(e);
      const retryable = retryableAnalysisError(e);
      if (known) return NextResponse.json({ error: known.error, retryable }, { status: known.status, headers: analysisRetryHeaders(e) });
      return NextResponse.json({ error: e instanceof Error && e.message.startsWith("L’AI") ? e.message : "La risposta AI non è valida. Riprova.", retryable }, { status: 502 });
    }
    const updated = await updateSlide(id, page, slide => ({ ...slide, explanation, generatedAt }));
    return NextResponse.json(updated);
  } catch (e) { return apiError(e); }
  finally { if (lock) inFlight.delete(lock); }
}
