import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requestGuard } from "@/lib/http";
import { cloudEnabled, services, userId } from "@/lib/firebase-server";
import { documentReference } from "@/lib/shared-access";
import { findSavedQuiz, readQuizIndexDocument } from "@/lib/quiz-store";
import { QuizGroupService } from "@/lib/quiz-groups";
import { getStudyProfile } from "@/lib/study-profile";
type Context = { params: Promise<{ id: string; quizId: string }> };
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
async function context(params: Context["params"]) {
  const { id, quizId } = await params;
  const document = await readQuizIndexDocument(id), quiz = await findSavedQuiz(document, quizId);
  const uid = await userId(), ref = await documentReference(id), service = new QuizGroupService(services().db, uid);
  const groups = await service.groups(id, quiz, ref.parent.parent!.id, document.folderId);
  return { document, quiz, service, groups, uid };
}
export async function GET(request: Request, { params }: Context) {
  const denied = await requestGuard(request); if (denied) return denied;
  try {
    if (!cloudEnabled()) return NextResponse.json({ groups: [] }, { headers });
    const { document, quiz, service, groups } = await context(params);
    return NextResponse.json({ groups: await service.leaderboard(document.id, quiz, groups) }, { headers });
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request, { params }: Context) {
  const denied = await requestGuard(request); if (denied) return denied;
  try {
    if (!cloudEnabled()) return NextResponse.json({ error: "La classifica richiede un account online." }, { status: 403 });
    const input = z.object({ includeAnswers: z.boolean() }).strict().safeParse(await request.json().catch(() => null));
    if (!input.success) return NextResponse.json({ error: "Preferenza non valida." }, { status: 400 });
    const { document, quiz, service, groups, uid } = await context(params), profile = await getStudyProfile();
    const name = profile.displayName || (await services().auth.getUser(uid)).displayName?.slice(0, 80) || "Studente";
    return NextResponse.json(await service.publish(document.id, quiz, groups, input.data.includeAnswers, name, profile.university || ""), { headers });
  } catch (error) { return apiError(error); }
}
export async function DELETE(request: Request, { params }: Context) {
  const denied = await requestGuard(request); if (denied) return denied;
  try {
    if (!cloudEnabled()) return NextResponse.json({ error: "La classifica richiede un account online." }, { status: 403 });
    const { service, groups } = await context(params);
    return NextResponse.json(await service.withdraw(groups), { headers });
  } catch (error) { return apiError(error); }
}
