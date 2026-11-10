import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteDocument, readDocument, readVersionedDocument, patchDocumentPage } from "@/lib/store";
import { apiError, requestGuard } from "@/lib/http";
type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: Context) {
  const denied = await requestGuard(request); if (denied) return denied;
  try {
    const result = await readVersionedDocument((await params).id, request.headers.get("if-none-match"));
    const headers = { ETag: result.etag, "Cache-Control": "private, no-cache", Vary: "Authorization", ...("metadata" in result && result.metadata ? { "X-Studio-Metadata": encodeURIComponent(JSON.stringify(result.metadata)) } : {}) };
    return result.document ? NextResponse.json(result.document, { headers }) : new Response(null, { status: 304, headers });
  } catch (e) { return apiError(e); }
}
const patch = z.object({ page: z.number().int().positive(), notes: z.string().max(50000).optional(), read: z.boolean().optional() });
export async function PATCH(request: Request, { params }: Context) {
  const denied = await requestGuard(request); if (denied) return denied;
  try {
    const result = patch.safeParse(await request.json());
    if (!result.success) return NextResponse.json({ error: "Dati non validi." }, { status: 400 });
    const { id } = await params;
    const { page, notes, read } = result.data;
    const updated = await patchDocumentPage(id, page, { ...(notes !== undefined ? { notes } : {}), ...(read !== undefined ? { read } : {}) });
    return NextResponse.json(request.headers.get("prefer") === "return=minimal" ? updated : await readDocument(id));
  } catch (e) { return apiError(e); }
}
export async function DELETE(request: Request, { params }: Context) {
  const denied = await requestGuard(request); if (denied) return denied;
  try { await deleteDocument((await params).id); return NextResponse.json({ ok: true }); } catch (e) { return apiError(e); }
}
