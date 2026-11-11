import { listFolders } from "@/lib/folders";
import { NextResponse } from "next/server";
import { createDocument, listDocuments } from "@/lib/store";
import { apiError, requestGuard } from "@/lib/http";
import { MAX_UPLOAD_BYTES, uploadFormat } from "@/lib/upload-formats";
import { prepareUpload } from "@/lib/prepare-upload";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const denied = await requestGuard(request); if (denied) return denied;
  try { return NextResponse.json(await listDocuments()); } catch (e) { return apiError(e); }
}
export async function POST(request: Request) {
  const denied = await requestGuard(request); if (denied) return denied;
  try {
    const form = await request.formData();
    const folderId = form.get("folderId");
    if (typeof folderId !== "string" || !folderId) return NextResponse.json({ error: "Apri un esame prima di caricare un file." }, { status: 400 });
    if (!(await listFolders()).some(f => f.id === folderId)) return NextResponse.json({ error: "Esame non trovato." }, { status: 400 });
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Scegli un PDF o un'immagine PNG o JPEG." }, { status: 400 });
    const format = uploadFormat(file.name);
    if (!format) return NextResponse.json({ error: "Scegli un PDF o un'immagine PNG o JPEG." }, { status: 400 });
    if (!file.size || file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Il file deve avere una dimensione compresa tra 1 byte e 500 MB." }, { status: 400 });
    const prepared = await prepareUpload(file.name, new Uint8Array(await file.arrayBuffer()));
    const result = await createDocument(prepared.name, prepared.bytes, prepared.pages, folderId);
    return NextResponse.json(result, { status: 201 });
  } catch (e) { return apiError(e); }
}
