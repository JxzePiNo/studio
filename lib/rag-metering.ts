import { cloudEnabled, services, userId } from "./firebase-server";
import { currentCostMonth } from "./admin-monthly-costs";

/** Storage is billed across the account, not as model tokens. Keep estimates partial. */
export async function recordRagStorage(indexKey: string, usageBytes: number) {
  if (!cloudEnabled()) return;
  try {
    const { db } = services(), uid = await userId(), at = new Date().toISOString();
    const root = db.collection("users").doc(uid), model = "openai-vector-store";
    const event = root.collection("usageEvents").doc(`rag-${currentCostMonth().month}-${indexKey}`);
    const metrics = root.collection("metrics").doc("usage");
    await db.runTransaction(async tx => {
      const [existing, aggregate] = await Promise.all([tx.get(event), tx.get(metrics)]);
      if (existing.exists) return;
      const before = aggregate.data() || {}, models = { ...(before.models || {}) }, key = Buffer.from(model).toString("base64url");
      const previous = models[key] || { model, input: 0, output: 0, cached: 0, total: 0, calls: 0, unknown: 0 };
      models[key] = { ...previous, calls: previous.calls + 1, unknown: previous.unknown + 1 };
      tx.set(event, { feature: "rag-storage", model, input: 0, output: 0, cached: 0, total: 0, measured: false, status: "completed", durationMs: 0, at, usageBytes, indexKey });
      tx.set(metrics, { ...before, models, calls: (before.calls || 0) + 1, firstRecordedAt: before.firstRecordedAt || at, lastRecordedAt: at });
    });
  } catch (error) { console.error("RAG storage metering failed", { error: error instanceof Error ? error.message : "unknown" }); }
}
