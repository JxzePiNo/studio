import { NextResponse } from "next/server";
import { apiError, requestGuard } from "@/lib/http";
import { getStudyProfile, saveStudyProfile, studyProfileInputSchema } from "@/lib/study-profile";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const denied = await requestGuard(request); if (denied) return denied;
  try { return NextResponse.json(await getStudyProfile()); }
  catch (error) { return apiError(error); }
}

export async function PATCH(request: Request) {
  const denied = await requestGuard(request); if (denied) return denied;
  try {
    const parsed = studyProfileInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Profilo non valido: controlla nome, università e corso. Lo username deve contenere 3–24 lettere, numeri, punti o underscore." }, { status: 400 });
    return NextResponse.json(await saveStudyProfile(parsed.data));
  } catch (error) { return apiError(error); }
}
