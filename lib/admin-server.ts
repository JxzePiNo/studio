import { NextResponse } from "next/server";
import { cloudEnabled, services } from "./firebase-server";
import { localRequest } from "./http";
import { isAdminIdentity } from "./platform-config";
import type { DecodedIdToken } from "firebase-admin/auth";

export async function verifyAdminToken(token: string, verify: (token: string, revoked: boolean) => Promise<DecodedIdToken>) {
  try {
    const identity = await verify(token, true);
    if (!isAdminIdentity(identity)) return NextResponse.json({ error: "Accesso riservato all'amministratore." }, { status: 403 });
    return identity;
  } catch { return NextResponse.json({ error: "Sessione non valida. Accedi nuovamente." }, { status: 401 }); }
}

export async function adminGuard(request: Request) {
  const denied = localRequest(request); if (denied) return denied;
  if (!cloudEnabled()) return NextResponse.json({ error: "La dashboard richiede Firebase e l'account amministratore." }, { status: 403 });
  const token = request.headers.get("authorization");
  if (!token?.startsWith("Bearer ")) return NextResponse.json({ error: "Accedi con Google." }, { status: 401 });
  try {
    return await verifyAdminToken(token.slice(7), (token, revoked) => services().auth.verifyIdToken(token, revoked));
  } catch { return NextResponse.json({ error: "Sessione non valida. Accedi nuovamente." }, { status: 401 }); }
}
export async function auditAdmin(actor: string, action: string, target: string, details: Record<string, unknown> = {}) {
  await services().db.collection("adminAudit").add({ actor, action, target, details, at: new Date().toISOString() });
}
export function checkedUid(uid: string) { if (!/^[a-zA-Z0-9:_-]{1,128}$/.test(uid)) throw Object.assign(new Error("Utente non valido."), { status: 400 }); return uid; }
