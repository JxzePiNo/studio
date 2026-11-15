import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requestGuard } from "@/lib/http";
import { tourSections } from "@/lib/tony-tours";
import { getTonyTours, saveTonyTour } from "@/lib/tony-tour-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const denied = await requestGuard(request); if (denied) return denied;
  try { return NextResponse.json(await getTonyTours(), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return apiError(error); }
}
const input = z.object({ section: z.enum(tourSections), seen: z.boolean() }).strict();
export async function PATCH(request: Request) {
  const denied = await requestGuard(request); if (denied) return denied;
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Tour non valido." }, { status: 400 });
  try { return NextResponse.json(await saveTonyTour(parsed.data.section, parsed.data.seen), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return apiError(error); }
}
