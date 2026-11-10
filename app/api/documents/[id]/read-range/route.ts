import { NextResponse } from "next/server";
import { apiError, requestGuard } from "@/lib/http";
import { readDocument, updateDocument } from "@/lib/store";
import { readRangeInput, planReadRange } from "@/lib/read-range";
import { getStudyHistory, recordReadingBatch } from "@/lib/study-history-store";
import { studyDay } from "@/lib/study-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requestGuard(request); if (denied) return denied;
  try {
    const parsed = readRangeInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Indica un intervallo di pagine valido." }, { status: 400 });
    const { id } = await params;
    const current = await readDocument(id);
    let planned;
    try { planned = planReadRange(parsed.data, current.pages); }
    catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }
    const document = await updateDocument(id, doc => {
      for (const { page } of planned) doc.slides[page] = { ...doc.slides[page], notes: doc.slides[page]?.notes || "", read: true };
    });
    // Both writes are idempotent: retrying after an interrupted history write repairs it.
    try { await recordReadingBatch(planned.map(item => ({ documentId: id, ...item, read: true }))); }
    catch (error) {
      console.error("Reading range history save failed", error);
      return NextResponse.json({ error: "Le pagine sono segnate come lette, ma lo storico non è stato salvato. Riprova con lo stesso intervallo e periodo per completare il salvataggio senza duplicati.", documentUpdated: true }, { status: 503 });
    }
    return NextResponse.json(request.headers.get("prefer") === "return=minimal" ? { ok: true } : { document, history: await getStudyHistory(studyDay()) });
  } catch (error) { return apiError(error); }
}
