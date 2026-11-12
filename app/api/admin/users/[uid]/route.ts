import { NextResponse } from "next/server";
import { z } from "zod";
import { adminGuard, auditAdmin, checkedUid } from "@/lib/admin-server";
import { services } from "@/lib/firebase-server";
import { apiError } from "@/lib/http";
import { isAdminIdentity, userControlSchema } from "@/lib/platform-config";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const privateJson = (value: unknown) => NextResponse.json(value, { headers: { "Cache-Control": "private, no-store" } });
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), disabled: z.boolean() }).strict(),
  z.object({ action: z.literal("revoke") }).strict(),
  z.object({ action: z.literal("name"), name: z.string().trim().min(1).max(80) }).strict(),
  z.object({ action: z.literal("controls"), controls: userControlSchema }).strict(),
]);
export async function GET(request: Request, { params }: { params: Promise<{ uid: string }> }) {
  const identity = await adminGuard(request); if (identity instanceof Response) return identity;
  try {
    const uid = checkedUid((await params).uid), root = services().db.collection("users").doc(uid), url = new URL(request.url);
    const documentId = url.searchParams.get("documentId"), after = url.searchParams.get("after");
    if (documentId) {
      if (!/^[a-zA-Z0-9-]{1,100}$/.test(documentId) || (after && !/^[a-zA-Z0-9-]{1,100}$/.test(after))) return NextResponse.json({ error: "Documento non valido." }, { status: 400 });
      let query = root.collection("documents").doc(documentId).collection("slides").orderBy("__name__").limit(25);
      if (after) query = query.startAfter(after);
      const [metadata, slides, quizzes] = await Promise.all([root.collection("documents").doc(documentId).get(), query.get(), root.collection("documents").doc(documentId).collection("quizzes").limit(50).get()]);
      if (!metadata.exists) return NextResponse.json({ error: "Documento non trovato." }, { status: 404 });
      return privateJson({ document: metadata.data(), slides: slides.docs.map(doc => ({ page: doc.id, ...doc.data() })), cursor: slides.size === 25 ? slides.docs.at(-1)!.id : null, quizzes: quizzes.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
    }
    const view = url.searchParams.get("view");
    if (view === "documents" || view === "usageEvents" || view === "questions") {
      const order = view === "documents" ? "createdAt" : "at";
      let query = root.collection(view).orderBy(order, "desc").orderBy("__name__", "desc").limit(50);
      if (after) { const marker = await root.collection(view).doc(checkedUid(after)).get(); if (!marker.exists) return NextResponse.json({ error: "Pagina non valida." }, { status: 400 }); query = query.startAfter(marker); }
      const data = await query.get();
      return privateJson({ items: data.docs.map(doc => ({ id: doc.id, ...doc.data() })), cursor: data.size === 50 ? data.docs.at(-1)!.id : null });
    }
    const [user, profile, controls, usage, documents, folders, questions, events, sessions, referral, activity] = await Promise.all([
      services().auth.getUser(uid), root.collection("settings").doc("profile").get(), root.collection("settings").doc("controls").get(), root.collection("metrics").doc("usage").get(),
      root.collection("documents").orderBy("createdAt", "desc").limit(50).get(), root.collection("folders").limit(100).get(), root.collection("questions").orderBy("at", "desc").limit(50).get(), root.collection("usageEvents").orderBy("at", "desc").limit(50).get(), root.collection("studySessions").limit(50).get(), services().db.collection("referralJoins").doc(uid).get(), root.collection("metrics").doc("activity").get(),
    ]);
    return NextResponse.json({ uid, user: { email: user.email || "", name: user.displayName || "", disabled: user.disabled, verified: user.emailVerified, createdAt: user.metadata.creationTime, lastLoginAt: user.metadata.lastSignInTime || null, lastVisitAt: activity.data()?.lastVisitAt || null }, profile: profile.data() || {}, controls: controls.data() || {}, usage: usage.data() || null, documents: documents.docs.map(doc => ({ id: doc.id, ...doc.data() })), documentsCursor: documents.size === 50 ? documents.docs.at(-1)!.id : null, folders: folders.docs.map(doc => ({ id: doc.id, ...doc.data() })), questions: questions.docs.map(doc => ({ id: doc.id, ...doc.data() })), questionsCursor: questions.size === 50 ? questions.docs.at(-1)!.id : null, events: events.docs.map(doc => ({ id: doc.id, ...doc.data() })), eventsCursor: events.size === 50 ? events.docs.at(-1)!.id : null, sessions: sessions.docs.map(doc => ({ id: doc.id, ...doc.data() })), referral: referral.data() || null }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
export async function PATCH(request: Request, { params }: { params: Promise<{ uid: string }> }) {
  const identity = await adminGuard(request); if (identity instanceof Response) return identity;
  try {
    const uid = checkedUid((await params).uid), parsed = actionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Operazione non valida." }, { status: 400 });
    const input = parsed.data, { auth, db } = services(), user = await auth.getUser(uid);
    if (isAdminIdentity(user) && (input.action === "status" && input.disabled || input.action === "controls")) return NextResponse.json({ error: "Non puoi bloccare l'account amministratore." }, { status: 400 });
    await auditAdmin(identity.uid, `${input.action}.requested`, uid, input);
    if (input.action === "status") { await auth.updateUser(uid, { disabled: input.disabled }); if (input.disabled) await auth.revokeRefreshTokens(uid); }
    if (input.action === "revoke") await auth.revokeRefreshTokens(uid);
    if (input.action === "name") {
      await auth.updateUser(uid, { displayName: input.name });
      const profile = db.collection("users").doc(uid).collection("settings").doc("profile");
      await db.runTransaction(async tx => { const previous = await tx.get(profile); tx.set(profile, { ...(!previous.exists ? { studyProgram: "", onboardingCompleted: false } : {}), displayName: input.name, updatedAt: new Date().toISOString() }, { merge: true }); });
    }
    if (input.action === "controls") await db.collection("users").doc(uid).collection("settings").doc("controls").set(input.controls);
    await auditAdmin(identity.uid, `${input.action}.completed`, uid);
    return NextResponse.json({ ok: true });
  } catch (error) { return apiError(error); }
}
