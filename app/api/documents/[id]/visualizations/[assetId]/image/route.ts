import { requestGuard, apiError } from "@/lib/http";
import { readArtifactImage } from "@/lib/artifact-images";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string; assetId: string }> }) {
  const denied = await requestGuard(request); if (denied) return denied;
  try {
    const { id, assetId } = await params;
    const bytes = await readArtifactImage(id, assetId);
    let offset = 0;
    const stream = new ReadableStream<Uint8Array>({ pull(controller) { if (offset >= bytes.byteLength) { controller.close(); return; } const end = Math.min(offset + 65536, bytes.byteLength); controller.enqueue(bytes.subarray(offset, end)); offset = end; } });
    return new Response(stream, { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return apiError(error); }
}
