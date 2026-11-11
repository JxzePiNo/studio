import { readPdf } from "@/lib/store";
import { apiError, requestGuard } from "@/lib/http";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requestGuard(request); if (denied) return denied;
  try {
    const bytes = await readPdf((await params).id);
    // Stream large PDFs so opening them does not hit the hosting response limit.
    let offset = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= bytes.byteLength) { controller.close(); return; }
        const end = Math.min(offset + 64 * 1024, bytes.byteLength);
        controller.enqueue(bytes.subarray(offset, end));
        offset = end;
      },
    });
    return new Response(stream, { headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline; filename=slide.pdf", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (e) { return apiError(e); }
}
