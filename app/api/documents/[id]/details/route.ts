import { NextResponse } from "next/server";
import { z } from "zod";
import { updateDocument } from "@/lib/store";
import { apiError, requestGuard } from "@/lib/http";
export const runtime = "nodejs";
const schema = z.object({ name: z.string().trim().min(1).max(200).refine(v => !/[\x00-\x1f\x7f]/.test(v)) }).strict();
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requestGuard(request); if (denied) return denied;
  try {
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Materiale non valido." }, { status: 400 });
    const input = schema.safeParse(await request.json().catch(() => null));
    if (!input.success) return NextResponse.json({ error: "Inserisci un nome da 1 a 200 caratteri." }, { status: 400 });
    return NextResponse.json(await updateDocument(id, doc => { doc.originalName ||= doc.name; doc.name = input.data.name; }));
  } catch (error) { return apiError(error); }
}
