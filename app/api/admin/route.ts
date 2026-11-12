import { NextResponse } from "next/server";
import { AggregateField } from "@google-cloud/firestore";
import { adminGuard } from "@/lib/admin-server";
import { services } from "@/lib/firebase-server";
import { apiError } from "@/lib/http";
import { platformConfig } from "@/lib/platform-server";
import { platformSchema } from "@/lib/platform-config";
import { z } from "zod";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const identity = await adminGuard(request); if (identity instanceof Response) return identity;
  try {
    const url = new URL(request.url), cursor = url.searchParams.get("cursor") || undefined, email = url.searchParams.get("email");
    if (email && !z.string().email().max(254).safeParse(email).success) return NextResponse.json({ error: "Email non valida." }, { status: 400 });
    if (cursor && cursor.length > 2048) return NextResponse.json({ error: "Pagina non valida." }, { status: 400 });
    const { auth, db } = services();
    const [result, config, audit] = await Promise.all([email ? auth.getUserByEmail(email).then(user => ({ users: [user], pageToken: undefined })).catch(error => { if (error.code === "auth/user-not-found") return { users: [], pageToken: undefined }; throw error; }) : auth.listUsers(50, cursor), platformConfig(), db.collection("adminAudit").orderBy("at", "desc").limit(50).get()]);
    const users = [];
    // Bound concurrent Firestore reads even for a full user page.
    for (let offset = 0; offset < result.users.length; offset += 8) {
      users.push(...await Promise.all(result.users.slice(offset, offset + 8).map(async user => {
        const root = db.collection("users").doc(user.uid);
        // Separate sums use automatic single-field indexes. Combining size and
        // pages requires a composite index and excludes legacy files missing either field.
        const documents = root.collection("documents");
        const [usage, count, bytes, pages, activity] = await Promise.all([root.collection("metrics").doc("usage").get(), documents.count().get(), documents.aggregate({ value: AggregateField.sum("size") }).get(), documents.aggregate({ value: AggregateField.sum("pages") }).get(), root.collection("metrics").doc("activity").get()]);
        return { uid: user.uid, email: user.email || "", name: user.displayName || "", disabled: user.disabled, verified: user.emailVerified, createdAt: user.metadata.creationTime, lastLoginAt: user.metadata.lastSignInTime || null, lastVisitAt: activity.data()?.lastVisitAt || null, usage: usage.data() || null, files: { count: count.data().count, bytes: bytes.data().value, pages: pages.data().value }, activity: activity.data() || null };
      })));
    }
    return NextResponse.json({ users, cursor: result.pageToken || null, config, audit: audit.docs.map(doc => ({ id: doc.id, ...doc.data() })), generatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
export async function PATCH(request: Request) {
  const identity = await adminGuard(request); if (identity instanceof Response) return identity;
  try {
    const parsed = platformSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Impostazioni non valide." }, { status: 400 });
    const db = services().db, batch = db.batch(), at = new Date().toISOString();
    batch.set(db.collection("appSettings").doc("platform"), { config: parsed.data, updatedAt: at, updatedBy: identity.uid });
    batch.create(db.collection("adminAudit").doc(), { actor: identity.uid, action: "platform.update", target: "platform", details: parsed.data, at });
    await batch.commit();
    return NextResponse.json(parsed.data);
  } catch (error) { return apiError(error); }
}
