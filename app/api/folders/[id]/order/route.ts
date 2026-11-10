import { NextResponse } from "next/server";
import { z } from "zod";
import { updateFolder } from "@/lib/folders";
import { listDocuments } from "@/lib/store";
import { moveMaterial } from "@/lib/material-order";
import { apiError, requestGuard } from "@/lib/http";
export const runtime = "nodejs";
const schema = z.object({ documentId: z.string().uuid().optional(), move: z.enum(["up", "down", "first", "last", "name"]) }).strict().refine(v => v.move === "name" || !!v.documentId);
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requestGuard(request); if (denied) return denied;
  try {
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Esame non valido." }, { status: 400 });
    const input = schema.safeParse(await request.json().catch(() => null));
    if (!input.success) return NextResponse.json({ error: "Ordinamento non valido." }, { status: 400 });
    const documents = (await listDocuments()).filter(d => d.folderId === id);
    return NextResponse.json(await updateFolder(id, folder => { folder.documentOrder = moveMaterial(documents, folder.documentOrder || [], input.data.documentId, input.data.move); }));
  } catch (error) { return apiError(error); }
}
