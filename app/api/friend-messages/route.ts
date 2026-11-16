import { NextResponse } from "next/server";
import { requestGuard, apiError } from "@/lib/http";
import { cloudEnabled, services, userId } from "@/lib/firebase-server";
import { FriendsService } from "@/lib/friends";
import { friendMessageActionSchema } from "@/lib/friend-messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  const denied = await requestGuard(request); if (denied) return denied;
  try {
    if (!cloudEnabled()) return NextResponse.json({ messages: [] }, { headers });
    const service = new FriendsService(services().db, await userId());
    const targetId = new URL(request.url).searchParams.get("friend");
    return NextResponse.json({ messages: targetId !== null ? await service.conversation(targetId) : await service.incomingMessages() }, { headers });
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  const denied = await requestGuard(request); if (denied) return denied;
  try {
    const parsed = friendMessageActionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Messaggio non valido: scrivi da 1 a 2.000 caratteri." }, { status: 400, headers });
    if (!cloudEnabled()) return NextResponse.json({ error: "Accedi con Google nello spazio online per scrivere agli amici." }, { status: 403, headers });
    const service = new FriendsService(services().db, await userId()), input = parsed.data;
    return NextResponse.json(input.action === "send" ? await service.sendMessage(input.id, input.targetId, input.text) : await service.readMessages(input.ids), { headers });
  } catch (error) { return apiError(error); }
}
