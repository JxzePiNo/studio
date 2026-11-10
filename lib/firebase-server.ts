import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { headers } from "next/headers";
import { firebaseAuthFailure } from "./firebase-auth-errors";

export const cloudEnabled = () => process.env.NEXT_PUBLIC_FIREBASE_ENABLED === "true";
export function services() {
  const app = getApps().find(a => a.name === "margine-server") || initializeApp({
    credential: process.env.FIREBASE_PRIVATE_KEY ? cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }) : applicationDefault(),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  }, "margine-server");
  return { auth: getAuth(app), db: getFirestore(app), bucket: getStorage(app).bucket() };
}
export async function userId() {
  const token = (await headers()).get("authorization")?.replace(/^Bearer /, "");
  if (!token) throw Object.assign(new Error("Accedi con Google."), { status: 401 });
  try { return (await services().auth.verifyIdToken(token, true)).uid; }
  catch (error) {
    const failure = firebaseAuthFailure(error);
    throw Object.assign(new Error(failure.error), { status: failure.status });
  }
}
export async function userRoot() {
  return services().db.collection("users").doc(await userId());
}
