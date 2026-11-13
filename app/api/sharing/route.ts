import { NextResponse } from "next/server";
import { apiError, requestGuard } from "@/lib/http";
import { cloudEnabled, services, userId } from "@/lib/firebase-server";
import { getStudyProfile } from "@/lib/study-profile";
import { SharingService, sharingActionSchema } from "@/lib/sharing";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
async function service() {
  const uid = await userId(), profile = await getStudyProfile();
  return new SharingService(services().db, uid, profile, profile.displayName || (await services().auth.getUser(uid)).displayName?.slice(0, 80) || "Studente");
}
export async function GET(request: Request) {
  const denied = await requestGuard(request); if (denied) return denied;
  try {
    if (!cloudEnabled()) return NextResponse.json({ available: false, received: [], sent: [], publicCourses: [] }, { headers });
    const workspace = new URL(request.url).searchParams.get("workspace");
    if (workspace && !/^[a-f0-9-]{36}$/i.test(workspace)) return NextResponse.json({ error: "Corso non valido." }, { status: 400, headers });
    const sharing = await service();
    return NextResponse.json(workspace ? await sharing.workspace(workspace) : await sharing.overview(), { headers });
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  const denied = await requestGuard(request); if (denied) return denied;
  try {
    if (!cloudEnabled()) return NextResponse.json({ error: "La condivisione richiede l’account Google nello spazio online." }, { status: 403, headers });
    const parsed = sharingActionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Condivisione non valida. Seleziona fino a 50 amici." }, { status: 400, headers });
    const input = parsed.data, sharing = await service();
    const result = input.action === "create" ? await sharing.create(input) : input.action === "import" ? await sharing.import(input.shareId) : input.action === "revoke" ? await sharing.revoke(input.shareId) : await sharing.removeMember(input.folderId, input.action === "remove-member" ? input.memberId : undefined);
    return NextResponse.json(result, { headers });
  } catch (error) { return apiError(error); }
}
