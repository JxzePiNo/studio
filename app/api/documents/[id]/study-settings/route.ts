import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, requestGuard } from "@/lib/http";
import { setDocumentStudyExclusion } from "@/lib/store";

export const runtime = "nodejs";
const input = z.object({ excludedFromStudy: z.boolean() }).strict();
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requestGuard(request); if (denied) return denied;
  try {
    const id = z.string().uuid().safeParse((await params).id);
    const parsed = input.safeParse(await request.json().catch(() => null));
    if (!id.success || !parsed.success) return NextResponse.json({ error: "Impostazione di studio non valida." }, { status: 400 });
    return NextResponse.json(await setDocumentStudyExclusion(id.data, parsed.data.excludedFromStudy), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
