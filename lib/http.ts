import { NextResponse } from "next/server";
import { cloudEnabled, services } from "./firebase-server";

export async function requestGuard(request: Request) {
  const denied = localRequest(request);
  if (denied) return denied;
  if (!cloudEnabled()) return;
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ error: "Accedi con Google." }, { status: 401 });
  let auth;
  try { auth = services().auth; }
  catch (error) {
    logAuthFailure("initialize", error);
    return NextResponse.json({ error: "Configurazione Firebase del server non valida. Controlla le credenziali e il bucket nelle variabili del deployment." }, { status: 503 });
  }
  try { await auth.verifyIdToken(authorization.slice(7), true); }
  catch (error) {
    logAuthFailure("verify", error);
    return NextResponse.json({ error: "Sessione non valida. Accedi nuovamente." }, { status: 401 });
  }
}

function logAuthFailure(stage: "initialize" | "verify", error: unknown) {
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "unknown";
  console.error("Firebase authentication failed", { stage, code: /^[a-z0-9/_-]{1,80}$/i.test(code) ? code : "unknown" });
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
