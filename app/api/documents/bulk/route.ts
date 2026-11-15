import { NextResponse } from "next/server";
import { documentBulkSchema, mutateDocuments } from "@/lib/document-bulk";
import { apiError, requestGuard } from "@/lib/http";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const denied = await requestGuard(request); if (denied) return denied;
  const input = documentBulkSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Seleziona da 1 a 100 PDF dello stesso esame e un’azione valida." }, { status: 400 });
  try {
    return NextResponse.json(await mutateDocuments(input.data), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
