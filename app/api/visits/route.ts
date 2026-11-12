import { NextResponse } from "next/server";
import { requestGuard, apiError } from "@/lib/http";
import { cloudEnabled, services } from "@/lib/firebase-server";
import { recordPlatformVisit } from "@/lib/platform-visits";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const denied = await requestGuard(request); if (denied) return denied;
  if (!cloudEnabled()) return NextResponse.json({ tracked: false });
  try {
    const { auth, db } = services();
    const identity = await auth.verifyIdToken(request.headers.get("authorization")!.slice(7), true);
    return NextResponse.json({ tracked: true, lastVisitAt: await recordPlatformVisit(db, identity.uid) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
