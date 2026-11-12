import { NextResponse } from "next/server";
import { apiError, requestGuard } from "@/lib/http";
import { cloudEnabled, services, userId } from "@/lib/firebase-server";
import { getStudyProfile } from "@/lib/study-profile";
import { ReferralService, referralActionSchema } from "@/lib/referrals";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const denied = await requestGuard(request); if (denied) return denied;
  try {
    if (!cloudEnabled()) return NextResponse.json({ available: false, links: [], invitees: [] });
    return NextResponse.json(await new ReferralService(services().db, await userId()).overview(), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  const denied = await requestGuard(request); if (denied) return denied;
  try {
    if (!cloudEnabled()) return NextResponse.json({ error: "Gli inviti richiedono l'accesso con un account Google." }, { status: 403 });
    const parsed = referralActionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Richiesta non valida. Il saluto può contenere al massimo 280 caratteri." }, { status: 400 });
    const uid = await userId();
    const service = new ReferralService(services().db, uid);
    const action = parsed.data;
    if (action.action === "create") return NextResponse.json(await service.createLink(action.label));
    if (action.action === "read") return NextResponse.json(await service.read(action.greetingId));
    const profile = await getStudyProfile();
    const name = profile.displayName?.trim() || (await services().auth.getUser(uid)).displayName?.slice(0, 80) || "Un amico";
    return NextResponse.json(action.action === "claim" ? await service.claim(action.code, name) : await service.greet(action.recipientId, action.text, name));
  } catch (error) { return apiError(error); }
}
