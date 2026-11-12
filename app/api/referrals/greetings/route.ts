import { NextResponse } from "next/server";
import { apiError, requestGuard } from "@/lib/http";
import { cloudEnabled, services, userId } from "@/lib/firebase-server";
import { ReferralService } from "@/lib/referrals";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const denied = await requestGuard(request); if (denied) return denied;
  try {
    const greeting = cloudEnabled() ? await new ReferralService(services().db, await userId()).pending() : null;
    return NextResponse.json({ greeting }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
