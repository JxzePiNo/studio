import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/admin-server";
import { adminCosts } from "@/lib/admin-costs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const identity = await adminGuard(request);
  if (identity instanceof Response) return identity;
  const days = Number(new URL(request.url).searchParams.get("days") || 30);
  if (![7, 30, 90].includes(days)) return NextResponse.json({ error: "Periodo non valido." }, { status: 400 });
  return NextResponse.json(await adminCosts(days), { headers: { "Cache-Control": "private, no-store" } });
}
