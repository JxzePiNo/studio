import { NextResponse } from "next/server";
import { z } from "zod";
import { requestGuard, apiError } from "@/lib/http";
import { cloudEnabled, services } from "@/lib/firebase-server";
import { defaultNicknames } from "@/lib/user-nickname";

export const runtime = "nodejs";
const entrySchema = z.object({
  name: z.string().trim().min(1).max(80).regex(/^[\p{L}\p{M}'’-]+$/u),
  nickname: z.string().trim().min(1).max(40),
}).strict();

async function catalogue() {
  if (!cloudEnabled()) return { ...defaultNicknames };
  const snapshot = await services().db.collection("appSettings").doc("nicknames").get();
  return { ...defaultNicknames, ...(snapshot.data()?.entries || {}) } as Record<string, string>;
}

export async function GET(request: Request) {
  const denied = await requestGuard(request); if (denied) return denied;
  try { return NextResponse.json(await catalogue(), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return apiError(error); }
}

export async function PATCH(request: Request) {
  const denied = await requestGuard(request); if (denied) return denied;
  if (!cloudEnabled()) return NextResponse.json({ error: "Accedi con l'account autorizzato per modificare i soprannomi." }, { status: 403 });
  try {
    const token = request.headers.get("authorization")!.slice(7);
    const user = await services().auth.verifyIdToken(token, true);
    if (!user.email_verified || user.email?.toLowerCase() !== "paolucciacopo@gmail.com") return NextResponse.json({ error: "Non puoi modificare i soprannomi." }, { status: 403 });
    const parsed = entrySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Indica un nome e un soprannome valido (massimo 40 caratteri)." }, { status: 400 });
    const key = parsed.data.name.toLocaleLowerCase("it-IT");
    await services().db.collection("appSettings").doc("nicknames").set({ entries: { [key]: parsed.data.nickname } }, { merge: true });
    return NextResponse.json(await catalogue());
  } catch (error) { return apiError(error); }
}
