import type { Firestore } from "@google-cloud/firestore";

/** Server timestamps only; merge with question metrics without replacing them. */
export async function recordPlatformVisit(db: Firestore, uid: string, now = new Date()) {
  const reference = db.collection("users").doc(uid).collection("metrics").doc("activity");
  return db.runTransaction(async transaction => {
    const previous = await transaction.get(reference);
    const last = previous.get("lastVisitAt") as string | undefined;
    // Focus and visibility events can describe the same entry, across tabs too.
    if (last && now.getTime() - Date.parse(last) < 15_000) return last;
    const at = now.toISOString();
    transaction.set(reference, { lastVisitAt: at }, { merge: true });
    return at;
  });
}
