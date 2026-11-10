import { NextResponse } from "next/server";
import { z } from "zod";
import { listFolders } from "@/lib/folders";
import { updateDocument } from "@/lib/store";
import { apiError, requestGuard } from "@/lib/http";
export const runtime = "nodejs";
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requestGuard(request); if (denied) return denied;
  try {
    const input = z.object({ folderId: z.string().uuid().nullable() }).safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: "Cartella non valida." }, { status: 400 });
    const folderId = input.data.folderId;
    if (folderId && !(await listFolders()).some(f => f.id === folderId)) return NextResponse.json({ error: "Esame non trovato." }, { status: 404 });
    return NextResponse.json(await updateDocument((await params).id, d => { if (folderId) d.folderId = folderId; else delete d.folderId; }));
  } catch(e) { return apiError(e); }
}
