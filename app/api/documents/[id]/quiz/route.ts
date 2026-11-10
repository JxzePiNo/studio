import { NextResponse } from "next/server";
import { requestGuard, apiError } from "@/lib/http";
import { readDocument } from "@/lib/store";
import { listSavedQuizzes, readQuizIndexDocument } from "@/lib/quiz-store";
import { quizConfigSchema } from "@/lib/quiz";
import { createDocumentQuiz } from "@/lib/quiz-service";
import { openaiError } from "@/lib/openai";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requestGuard(request); if (denied) return denied;
  try {
    const config = quizConfigSchema.safeParse(await request.json().catch(() => null));
    if (!config.success) return NextResponse.json({ error: "Configurazione del quiz non valida." }, { status: 400 });
    return NextResponse.json(await createDocumentQuiz((await params).id, config.data), { status: 201 });
  } catch (error) { const known = openaiError(error); return known ? NextResponse.json({ error: known.error }, { status: known.status }) : apiError(error); }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requestGuard(request); if (denied) return denied;
  try {
    const summariesOnly = request.headers.get("X-Studio-Quiz-Summaries") === "1";
    const document = await (summariesOnly ? readQuizIndexDocument((await params).id) : readDocument((await params).id));
    const topics = [...new Set(Object.values(document.slides).flatMap(slide => slide.explanation ? [slide.explanation.title, ...slide.explanation.concepts.map(concept => concept.title)] : []).map(topic => topic.trim()).filter(Boolean))].slice(0, 100);
    const quizzes = (await listSavedQuizzes(document)).map(quiz => ({ id: quiz.id, title: quiz.title, documentId: document.id, createdAt: quiz.createdAt, questionCount: quiz.questions.length }));
    return NextResponse.json({ topics, pages: document.pages, quizzes }, { headers: { Vary: "Authorization, X-Studio-Quiz-Summaries", "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
