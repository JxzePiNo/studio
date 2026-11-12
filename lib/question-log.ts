import { cloudEnabled, services, userId } from "./firebase-server";
export async function recordQuestion(documentId: string, page: number, question: string, kind = "chat") {
  if (!cloudEnabled()) return;
  try {
    const root = services().db.collection("users").doc(await userId()), event = root.collection("questions").doc(), metrics = root.collection("metrics").doc("activity"), at = new Date().toISOString();
    await services().db.runTransaction(async tx => {
      const before = await tx.get(metrics);
      tx.create(event, { documentId, page, question: question.slice(0, 4000), kind, at });
      tx.set(metrics, { questions: (before.get("questions") || 0) + 1, firstRecordedAt: before.get("firstRecordedAt") || at, lastRecordedAt: at }, { merge: true });
    });
  } catch (error) { console.error("Question logging failed", error instanceof Error ? error.message : "unknown"); }
}
