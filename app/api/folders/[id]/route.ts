import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteFolder, updateFolder } from "@/lib/folders";
import { apiError, requestGuard } from "@/lib/http";
import { examColors } from "@/lib/exam-colors";
import { validExamDate } from "@/lib/study-plan";
import { validExamCfu } from "@/lib/exam-cfu";

export const runtime = "nodejs";

const input = z.object({
  archived: z.boolean().optional(),
  optional: z.boolean().optional(),
  name: z.string().trim().min(1).max(100).optional(),
  color: z.enum(examColors).optional(),
  examDate: z.string().refine(validExamDate, "Data non valida.").nullable().optional(),
  pagesPerHour: z.number().min(1).max(200).optional(),
  cfu: z.number().refine(validExamCfu).nullable().optional(),
  nonStudyWeekdays: z.array(z.number().int().min(0).max(6)).max(7).transform(days => [...new Set(days)]).optional(),
  nonStudyDates: z.array(z.string().refine(validExamDate, "Giorno non valido.")).max(1000).transform(dates => [...new Set(dates)]).optional(),
}).strict().refine(value => Object.values(value).some(field => field !== undefined), "Nessuna modifica indicata.");

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requestGuard(request); if (denied) return denied;
  try {
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Esame non valido." }, { status: 400 });
    const json = await request.json().catch(() => null);
    const parsed = input.safeParse(json);
    if (!parsed.success && parsed.error.issues.some(issue => issue.path[0] === "optional")) return NextResponse.json({ error: "Indica se l’esame è facoltativo." }, { status: 400 });
    if (!parsed.success && parsed.error.issues.some(issue => issue.path[0] === "cfu")) return NextResponse.json({ error: "Indica CFU tra 0,5 e 120, a incrementi di 0,5." }, { status: 400 });
    if (!parsed.success) return NextResponse.json({ error: "Indica date valide, giorni della settimana da 0 a 6 e un ritmo di studio tra 1 e 200 pagine all’ora." }, { status: 400 });
    return NextResponse.json(await updateFolder(id, parsed.data));
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requestGuard(request); if (denied) return denied;
  try {
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Esame non valido." }, { status: 400 });
    await deleteFolder(id);
    return NextResponse.json({ deleted: true });
  } catch (error) { return apiError(error); }
}
