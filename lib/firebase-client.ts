import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

export const firebaseEnabled = process.env.NEXT_PUBLIC_FIREBASE_ENABLED === "true";
export function browserAuth() {
  // The proxy must be enabled together with the /__/auth rewrite and the
  // app domain's OAuth redirect URI. Keep popup creation in the click handler.
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_PROXY === "true" && typeof window !== "undefined"
    ? window.location.host
    : process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const app = getApps().length ? getApp() : initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  });
  return getAuth(app);
}
export async function authHeaders(): Promise<Record<string, string>> {
  if (!firebaseEnabled) return {};
  const user = browserAuth().currentUser;
  if (!user) throw new Error("Accedi con Google per aprire il tuo spazio di studio.");
  return { Authorization: `Bearer ${await user.getIdToken()}` };
}
