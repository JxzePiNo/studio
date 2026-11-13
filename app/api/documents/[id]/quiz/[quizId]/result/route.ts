import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requestGuard } from "@/lib/http";
import { findSavedQuiz, readQuizIndexDocument, saveQuizResult } from "@/lib/quiz-store";
import { quizResult } from "@/lib/quiz-score";

export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string; quizId: string }> }) {
  const denied = await requestGuard(request); if (denied) return denied;
  try {
    const parsed = z.object({ answers: z.record(z.string().regex(/^(?:[0-9]|[12][0-9])$/), z.string().max(5000)) }).strict().safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Risposte del quiz non valide." }, { status: 400 });
    const { id, quizId } = await params;
    const quiz = await findSavedQuiz(await readQuizIndexDocument(id), quizId);
    for (const [index, answer] of Object.entries(parsed.data.answers)) {
      const question = quiz.questions[Number(index)];
      if (!question || (question.type !== "open" && !question.options.some((_, option) => answer === String(option)))) return NextResponse.json({ error: "Una risposta non corrisponde alle domande del quiz." }, { status: 400 });
    }
    const total = quiz.questions.filter(question => question.type !== "open").length;
    const correct = quiz.questions.filter((question, index) => question.type !== "open" && parsed.data.answers[index] === String(question.correctIndex)).length;
    const result = { answers: parsed.data.answers, correct, total, ...quizResult(correct, total), completedAt: new Date().toISOString() };
    await saveQuizResult(id, quizId, result);
    return NextResponse.json(result);
  } catch (error) { return apiError(error); }
}
