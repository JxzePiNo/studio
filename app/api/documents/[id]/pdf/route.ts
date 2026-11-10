import { readPdf } from "@/lib/store";
import { apiError, requestGuard } from "@/lib/http";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requestGuard(request); if (denied) return denied;
  try {
    const bytes = await readPdf((await params).id);
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline; filename=slide.pdf", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (e) { return apiError(e); }
}
