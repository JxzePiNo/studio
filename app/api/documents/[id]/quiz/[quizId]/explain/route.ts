import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requestGuard } from "@/lib/http";
import { openaiError } from "@/lib/openai";
import { explainQuizAnswer } from "@/lib/quiz-explanation";
export const runtime = "nodejs";
export const maxDuration = 90;
export async function POST(request: Request, { params }: { params: Promise<{ id: string; quizId: string }> }) {
  const denied = await requestGuard(request); if (denied) return denied;
  try {
    const input = z.object({ questionIndex: z.number().int().min(0).max(29), selectedIndex: z.number().int().min(0).max(3) }).strict().safeParse(await request.json().catch(() => null));
    if (!input.success) return NextResponse.json({ error: "Risposta del quiz non valida." }, { status: 400 });
    const { id, quizId } = await params;
    return NextResponse.json({ explanation: await explainQuizAnswer(id, quizId, input.data.questionIndex, input.data.selectedIndex) });
  } catch (error) { const known = openaiError(error); return known ? NextResponse.json({ error: known.error }, { status: known.status }) : apiError(error); }
}
