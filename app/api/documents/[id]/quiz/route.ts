import { NextResponse } from "next/server";
import { requestGuard, apiError } from "@/lib/http";
import { readDocument } from "@/lib/store";
import { listSavedQuizzes } from "@/lib/quiz-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requestGuard(request); if (denied) return denied;
  try {
    const document = await readDocument((await params).id);
    const topics = [...new Set(Object.values(document.slides).flatMap(slide => slide.explanation ? [slide.explanation.title, ...slide.explanation.concepts.map(concept => concept.title)] : []).map(topic => topic.trim()).filter(Boolean))].slice(0, 100);
    const quizzes = (await listSavedQuizzes(document)).map(quiz => ({ id: quiz.id, title: quiz.title, documentId: document.id, createdAt: quiz.createdAt, questionCount: quiz.questions.length }));
    return NextResponse.json({ topics, pages: document.pages, quizzes });
  } catch (error) { return apiError(error); }
}
