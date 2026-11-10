import { NextResponse } from "next/server";
import { cloudEnabled, services } from "./firebase-server";

export async function requestGuard(request: Request) {
  const denied = localRequest(request);
  if (denied) return denied;
  if (!cloudEnabled()) return;
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ error: "Accedi con Google." }, { status: 401 });
  try { await services().auth.verifyIdToken(authorization.slice(7), true); }
  catch { return NextResponse.json({ error: "Sessione non valida. Accedi nuovamente." }, { status: 401 }); }
}

export function localRequest(request: Request) {
  // Next may normalize request.url to localhost even when the browser uses 127.0.0.1.
  // Validate the actual Host header before comparing the browser's Origin.
  const internalUrl = new URL(request.url);
  let url: URL;
  try { url = new URL(`${internalUrl.protocol}//${request.headers.get("host") || internalUrl.host}`); }
  catch { return NextResponse.json({ error: "Host non valido." }, { status: 403 }); }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (process.env.NEXT_PUBLIC_FIREBASE_ENABLED !== "true" && !["localhost", "127.0.0.1", "::1"].includes(hostname)) return NextResponse.json({ error: "Questa applicazione è accessibile solo in locale." }, { status: 403 });
  const origin = request.headers.get("origin");
  if ((origin && origin !== url.origin) || request.headers.get("sec-fetch-site") === "cross-site") return NextResponse.json({ error: "Origine della richiesta non consentita." }, { status: 403 });
}
export function apiError(error: unknown) {
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === "ENOENT") return NextResponse.json({ error: "Documento non trovato." }, { status: 404 });
  const status = (error as { status?: number })?.status;
  if (status === 401 || status === 400 || status === 404) return NextResponse.json({ error: (error as Error).message }, { status });
  console.error(error);
  return NextResponse.json({ error: "Impossibile completare l’operazione. Controlla i file e riprova." }, { status: 500 });
}
