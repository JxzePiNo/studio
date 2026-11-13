import { NextResponse } from "next/server";
import { apiError, requestGuard } from "@/lib/http";
import { cloudEnabled, services, userId } from "@/lib/firebase-server";
import { ReferralService } from "@/lib/referrals";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const denied = await requestGuard(request); if (denied) return denied;
  try {
    const result = cloudEnabled() ? await new ReferralService(services().db, await userId()).welcome() : { welcome: false, greeting: null };
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
