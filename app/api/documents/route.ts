import { listFolders } from "@/lib/folders";
import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { createDocument, listDocuments } from "@/lib/store";
import { apiError, requestGuard } from "@/lib/http";
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
    if (typeof folderId !== "string" || !folderId) return NextResponse.json({ error: "Apri un esame prima di caricare un PDF." }, { status: 400 });
    if (!(await listFolders()).some(f => f.id === folderId)) return NextResponse.json({ error: "Esame non trovato." }, { status: 400 });
    const file = form.get("file");
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".pdf")) return NextResponse.json({ error: "Scegli un file PDF." }, { status: 400 });
    if (!file.size || file.size > 30 * 1024 * 1024) return NextResponse.json({ error: "Il PDF deve avere una dimensione compresa tra 1 byte e 30 MB." }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    let pdf: PDFDocument;
    try { pdf = await PDFDocument.load(bytes); } catch { return NextResponse.json({ error: "Il PDF non è leggibile o è protetto da password." }, { status: 400 }); }
    const pages = pdf.getPageCount();
    if (pages < 1 || pages > 1000) return NextResponse.json({ error: "Sono supportati PDF da 1 a 1.000 pagine." }, { status: 400 });
    const result = await createDocument(file.name.replace(/[\x00-\x1f]/g, "").slice(0, 200), bytes, pages, folderId);
    return NextResponse.json(result, { status: 201 });
  } catch (e) { return apiError(e); }
}
