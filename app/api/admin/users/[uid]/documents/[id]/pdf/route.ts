import { adminGuard, checkedUid } from "@/lib/admin-server";
import { services } from "@/lib/firebase-server";
import { apiError } from "@/lib/http";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ uid: string; id: string }> }) {
  const identity = await adminGuard(request); if (identity instanceof Response) return identity;
  try {
    const { uid, id } = await params; checkedUid(uid);
    if (!/^[a-zA-Z0-9-]{1,100}$/.test(id)) throw Object.assign(new Error("Documento non valido."), { status: 400 });
    const reference = services().db.collection("users").doc(uid).collection("documents").doc(id);
    const metadata = await reference.get();
    if (!metadata.exists || metadata.get("deleting")) throw Object.assign(new Error("Documento non trovato."), { status: 404 });
    const blobId = metadata.get("sharedBlobId") || metadata.get("contentBlobId");
    const blob = blobId ? await services().db.collection("sharedBlobs").doc(blobId).get() : undefined;
    if (blobId && !blob?.exists) throw Object.assign(new Error("Documento non trovato."), { status: 404 });
    const nodeStream = services().bucket.file(blob?.get("path") || `${reference.path}/original.pdf`).createReadStream();
    const { Readable } = await import("node:stream");
    return new Response(Readable.toWeb(nodeStream) as ReadableStream, { headers: { "Content-Type": "application/pdf", "Cache-Control": "private, no-store", "Content-Disposition": "attachment; filename=documento.pdf" } });
  } catch (error) { return apiError(error); }
}
