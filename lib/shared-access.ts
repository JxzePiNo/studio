import type { Firestore } from "@google-cloud/firestore";
import { services, userId, userRoot } from "./firebase-server";

export type SharedWorkspace = { ownerId: string; members: string[]; chatSince?: Record<string, number> };
const denied = () => Object.assign(new Error("Spazio condiviso non disponibile."), { status: 404 });
export async function folderReference(id: string) { return resolveFolderReference(services().db, await userId(), id); }
export async function resolveFolderReference(db: Firestore, uid: string, id: string) {
  const root = db.collection("users").doc(uid);
  const own = root.collection("folders").doc(id);
  if ((await own.get()).exists) return own;
  const shared = (await db.collection("sharedWorkspaces").doc(id).get()).data() as SharedWorkspace | undefined;
  if (!shared?.members.includes(root.id)) throw denied();
  const ref = db.collection("users").doc(shared.ownerId).collection("folders").doc(id);
  if (!(await ref.get()).exists) throw denied();
  return ref;
}
export async function documentReference(id: string) { return resolveDocumentReference(services().db, await userId(), id); }
export async function resolveDocumentReference(db: Firestore, uid: string, id: string) {
  const root = db.collection("users").doc(uid), own = root.collection("documents").doc(id);
  if ((await own.get()).exists) return own;
  const pointer = (await db.collection("collaborativeDocuments").doc(id).get()).data() as { ownerId: string; folderId: string } | undefined;
  if (!pointer) throw Object.assign(new Error("Documento non trovato."), { code: "ENOENT" });
  const workspace = (await db.collection("sharedWorkspaces").doc(pointer.folderId).get()).data() as SharedWorkspace | undefined;
  if (!workspace || workspace.ownerId !== pointer.ownerId || !workspace.members.includes(root.id)) throw denied();
  const ref = db.collection("users").doc(pointer.ownerId).collection("documents").doc(id);
  const metadata = await ref.get();
  if (!metadata.exists || metadata.get("folderId") !== pointer.folderId) throw denied();
  return ref;
}
export async function collaborativeWorkspaces(includeOwned = false) {
  const uid = await userId();
  const snapshot = await services().db.collection("sharedWorkspaces").where("members", "array-contains", uid).get();
  return snapshot.docs.filter(doc => includeOwned || doc.get("ownerId") !== uid).map(doc => ({ id: doc.id, ...doc.data() as SharedWorkspace }));
}
export async function assertCourseOwner(id: string) {
  const ref = await folderReference(id);
  if (ref.parent.parent!.id !== await userId()) throw Object.assign(new Error("Solo l’autore può eliminare o pubblicare il corso. I coautori possono modificarne i materiali."), { status: 403 });
  return ref;
}
