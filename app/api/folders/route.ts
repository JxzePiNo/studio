import { NextResponse } from "next/server";
import { z } from "zod";
import { createFolder, listFolders } from "@/lib/folders";
import { apiError, requestGuard } from "@/lib/http";
import { validExamDate } from "@/lib/study-plan";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const denied = await requestGuard(request); if (denied) return denied;
  try { return NextResponse.json(await listFolders()); } catch(e) { return apiError(e); }
}
export async function POST(request: Request) {
  const denied = await requestGuard(request); if (denied) return denied;
  try {
    const parsed = z.object({
      name: z.string().trim().min(1).max(100),
      examDate: z.string().refine(validExamDate).optional(),
      nonStudyWeekdays: z.array(z.number().int().min(0).max(6)).max(7).transform(days => [...new Set(days)]).optional(),
      nonStudyDates: z.array(z.string().refine(validExamDate)).max(1000).transform(dates => [...new Set(dates)]).optional(),
    }).strict().safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Inserisci un nome per l’esame (massimo 100 caratteri) e date di studio valide." }, { status: 400 });
    return NextResponse.json(await createFolder(parsed.data.name, parsed.data.examDate, { nonStudyWeekdays: parsed.data.nonStudyWeekdays, nonStudyDates: parsed.data.nonStudyDates }), { status: 201 });
  } catch(e) { return apiError(e); }
}
