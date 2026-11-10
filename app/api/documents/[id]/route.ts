import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteDocument, readDocument, updateDocument } from "@/lib/store";
import { apiError, requestGuard } from "@/lib/http";
type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: Context) {
  const denied = await requestGuard(request); if (denied) return denied;
  try { return NextResponse.json(await readDocument((await params).id)); } catch (e) { return apiError(e); }
}
const patch = z.object({ page: z.number().int().positive(), notes: z.string().max(50000).optional(), read: z.boolean().optional() });
export async function PATCH(request: Request, { params }: Context) {
  const denied = await requestGuard(request); if (denied) return denied;
  try {
    const result = patch.safeParse(await request.json());
    if (!result.success) return NextResponse.json({ error: "Dati non validi." }, { status: 400 });
    const { id } = await params;
    const doc = await readDocument(id);
    if (result.data.page > doc.pages) return NextResponse.json({ error: "Pagina non valida." }, { status: 400 });
    const { page, notes, read } = result.data;
    return NextResponse.json(await updateDocument(id, d => {
      if (notes !== undefined) d.slides[page] = { ...d.slides[page], notes };
      if (read !== undefined) d.slides[page] = { ...d.slides[page], notes: d.slides[page]?.notes || "", read };
      if (notes === undefined && read === undefined) d.currentPage = page;
    }));
  } catch (e) { return apiError(e); }
}
export async function DELETE(request: Request, { params }: Context) {
  const denied = await requestGuard(request); if (denied) return denied;
  try { await deleteDocument((await params).id); return NextResponse.json({ ok: true }); } catch (e) { return apiError(e); }
}
