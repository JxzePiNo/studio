import { NextResponse } from "next/server";
import { apiError, requestGuard } from "@/lib/http";
import { cloudEnabled, services, userId } from "@/lib/firebase-server";
import { getStudyProfile } from "@/lib/study-profile";
import { FriendsService, friendsActionSchema, friendsPeriodSchema } from "@/lib/friends";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
async function context() {
  const uid = await userId(), profile = await getStudyProfile();
  const account = !profile.photoURL || !profile.displayName ? await services().auth.getUser(uid) : null;
  const name = profile.displayName || account?.displayName?.slice(0, 80) || profile.nickname || "Studente";
  const identity = { name, photoURL: profile.photoURL || account?.photoURL || "", studyProgram: profile.studyProgram, nickname: profile.nickname || "", university: profile.university || "", city: profile.city || "" };
  const service = new FriendsService(services().db, uid);
  await service.ensureProfile(identity);
  return { service, identity };
}

export async function GET(request: Request) {
  const denied = await requestGuard(request); if (denied) return denied;
  try {
    const url = new URL(request.url);
    const period = friendsPeriodSchema.safeParse(url.searchParams.get("period") || "day");
    if (!period.success) return NextResponse.json({ error: "Periodo non valido." }, { status: 400, headers });
    if (!cloudEnabled()) return NextResponse.json({ available: false, self: null, friends: [], incoming: [], outgoing: [], leaderboard: [], period: period.data }, { headers });
    const { service } = await context();
    if (url.searchParams.has("profile")) return NextResponse.json(await service.sharedProfile(url.searchParams.get("profile") || ""), { headers });
    if (url.searchParams.has("activity")) return NextResponse.json(await service.activity(), { headers });
    if (url.searchParams.has("search")) {
      const name = url.searchParams.get("search") || "";
      if (name.length > 80) return NextResponse.json({ error: "Inserisci al massimo 80 caratteri." }, { status: 400, headers });
      return NextResponse.json(await service.search(name), { headers });
    }
    if (url.searchParams.has("self")) return NextResponse.json(await service.self(), { headers });
    return NextResponse.json(await service.overview(period.data), { headers });
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  const denied = await requestGuard(request); if (denied) return denied;
  try {
    if (!cloudEnabled()) return NextResponse.json({ error: "Amici è disponibile con l’account Google nello spazio online." }, { status: 403, headers });
    const parsed = friendsActionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Richiesta non valida." }, { status: 400, headers });
    const { service, identity } = await context(), input = parsed.data;
    if (input.action === "block") return NextResponse.json(await service.block(input.targetId, input.blocked), { headers });
    if (input.action === "report") return NextResponse.json(await service.report(input.targetId, input.reason, input.details), { headers });
    if (input.action === "relationship") return NextResponse.json(await service.relationship(input.targetId, input.operation), { headers });
    if (input.action === "presence") return NextResponse.json(await service.presence(input.tabId, input.active, input.studying), { headers });
    return NextResponse.json(await service.saveSettings(input, identity), { headers });
  } catch (error) { return apiError(error); }
}
