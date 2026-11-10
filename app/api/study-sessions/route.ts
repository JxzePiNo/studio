import { NextResponse } from "next/server";
import { apiError, requestGuard } from "@/lib/http";
import { mergeSessionsSchema, sessionIdsSchema, studyDateSchema, studyHistoryInputSchema } from "@/lib/study-history";
import { mutateStudySessions, getStudyHistory, importReadingActivity, recordReadingBatch, saveStudySession } from "@/lib/study-history-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function mutate(request: Request, action: "delete" | "merge") {
  const denied = await requestGuard(request); if (denied) return denied;
  const parsed = (action === "merge" ? mergeSessionsSchema : sessionIdsSchema).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Selezione di sessioni non valida." }, { status: 400 });
  try { await mutateStudySessions(parsed.data.ids, action); return NextResponse.json({ ok: true }); } catch (error) { return apiError(error); }
}
export async function DELETE(request: Request) { return mutate(request, "delete"); }
export async function PATCH(request: Request) { return mutate(request, "merge"); }
export async function GET(request: Request) {
  const denied = await requestGuard(request); if (denied) return denied;
  const day = studyDateSchema.safeParse(new URL(request.url).searchParams.get("day") || new Date().toISOString().slice(0, 10));
  if (!day.success) return NextResponse.json({ error: "Data non valida." }, { status: 400 });
  try { return NextResponse.json(await getStudyHistory(day.data)); } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  const denied = await requestGuard(request); if (denied) return denied;
  const parsed = studyHistoryInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dati della sessione non validi." }, { status: 400 });
  const day = new URL(request.url).searchParams.get("day") || new Date().toISOString().slice(0, 10);
  if (!studyDateSchema.safeParse(day).success) return NextResponse.json({ error: "Data non valida." }, { status: 400 });
  try {
    const input = parsed.data;
    if (input.type === "read") { const { type: _type, ...event } = input; await recordReadingBatch([event]); }
    else if (input.type === "session") await saveStudySession(input.session);
    else await importReadingActivity(input.activity);
    return NextResponse.json(await getStudyHistory(day));
  } catch (error) { return apiError(error); }
}
