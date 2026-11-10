import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requestGuard } from "@/lib/http";
import { readDocument, updateDocument } from "@/lib/store";
import { deleteSavedQuiz, findSavedQuiz, saveQuiz } from "@/lib/quiz-store";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; quizId: string }> };
export async function GET(request: Request, { params }: Context) {
  const denied = await requestGuard(request); if (denied) return denied;
  try {
    const { id, quizId } = await params;
    return NextResponse.json(await findSavedQuiz(await readDocument(id), quizId));
  } catch (error) { return apiError(error); }
}
export async function PATCH(request: Request, { params }: Context) {
  const denied = await requestGuard(request); if (denied) return denied;
  try {
    const input = z.object({ title: z.string().trim().min(1).max(200) }).strict().safeParse(await request.json().catch(() => null));
    if (!input.success) return NextResponse.json({ error: "Indica un nome da 1 a 200 caratteri." }, { status: 400 });
    const { id, quizId } = await params;
    const quiz = { ...await findSavedQuiz(await readDocument(id), quizId), title: input.data.title };
    await saveQuiz(id, quiz);
    await updateDocument(id, document => {
      for (const slide of Object.values(document.slides)) for (const message of slide.chat || []) if (message.quiz?.id === quizId) { message.quiz.title = quiz.title; message.content = `Quiz pronto: ${quiz.title}`; }
    });
    return NextResponse.json(quiz);
  } catch (error) { return apiError(error); }
}
export async function DELETE(request: Request, { params }: Context) {
  const denied = await requestGuard(request); if (denied) return denied;
  try {
    const { id, quizId } = await params;
    await findSavedQuiz(await readDocument(id), quizId);
    await deleteSavedQuiz(id, quizId);
    await updateDocument(id, document => {
      for (const slide of Object.values(document.slides)) if (slide.chat) slide.chat = slide.chat.map(message => message.quiz?.id === quizId ? { role: "assistant", content: "Quiz eliminato." } : message);
    });
    return NextResponse.json({ ok: true });
  } catch (error) { return apiError(error); }
}
