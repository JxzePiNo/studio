import { NextResponse } from "next/server";
import { localRequest } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const denied = localRequest(request); if (denied) return denied;
  return NextResponse.json({ configured: Boolean(process.env.OPENAI_API_KEY?.trim()), provider: "OpenAI" });
}
