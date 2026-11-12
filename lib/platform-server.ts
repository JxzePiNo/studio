import { NextResponse } from "next/server";
import { cloudEnabled, services, userId } from "./firebase-server";
import { defaultPlatform, isAdminIdentity, platformSchema, type Feature, type PlatformConfig } from "./platform-config";

export async function platformConfig(): Promise<PlatformConfig> {
  if (!cloudEnabled()) return structuredClone(defaultPlatform);
  const snapshot = await services().db.collection("appSettings").doc("platform").get();
  return snapshot.exists ? platformSchema.parse(snapshot.get("config")) : structuredClone(defaultPlatform);
}
export async function requireFeature(feature: Feature) {
  if (!cloudEnabled()) return;
  const [config, uid] = await Promise.all([platformConfig(), userId()]);
  const controls = (await services().db.collection("users").doc(uid).collection("settings").doc("controls").get()).data();
  if (!config.features[feature] || controls?.features?.[feature] === false || controls?.aiBlocked) throw Object.assign(new Error("Questa funzionalità è stata disattivata dall'amministratore."), { status: 403 });
}
export async function platformDenial(request: Request, user: { uid: string; email?: string; email_verified?: boolean }) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const path = new URL(request.url).pathname;
  if (path.startsWith("/api/admin") || path === "/api/nicknames" || path === "/api/visits") return;
  const config = await platformConfig();
  if (config.maintenance && !isAdminIdentity(user)) return NextResponse.json({ error: config.message || "Piattaforma in manutenzione." }, { status: 503 });
  let feature: Feature | undefined;
  if ((path === "/api/documents" || path === "/api/documents/upload") && request.method === "POST") feature = "uploads";
  else if (path.endsWith("/analyze")) feature = "analysis";
  else if (path.endsWith("/chat")) feature = "chat";
  else if (/\/quiz(?:\/[^/]+\/explain)?$/.test(path) && request.method === "POST") feature = "quizzes";
  else if (path.startsWith("/api/referrals")) feature = "referrals";
  else if (path.endsWith("/visualizations") && request.method === "POST") {
    const body = await request.clone().json().catch(() => null);
    feature = body?.kind === "image" ? "images" : body?.kind === "diagram" ? "diagrams" : "maps";
  }
  if (!feature) return;
  const controls = (await services().db.collection("users").doc(user.uid).collection("settings").doc("controls").get()).data();
  if (!config.features[feature] || controls?.features?.[feature] === false || (controls?.aiBlocked && ["analysis", "chat", "quizzes", "maps", "images", "diagrams"].includes(feature))) return NextResponse.json({ error: "Questa funzionalità è stata disattivata dall'amministratore." }, { status: 403 });
}
