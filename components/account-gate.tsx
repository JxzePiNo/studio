"use client";
import { useEffect, useState } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { browserAuth, firebaseEnabled } from "@/lib/firebase-client";
import { LoginScreen } from "./login-screen";
import { StudyProfileProvider } from "./study-profile-provider";
import Workspace from "./workspace";
import { useReferralCapture } from "./use-referral-capture";
import { usePlatformVisit } from "./use-platform-visit";

export default function AccountGate() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!firebaseEnabled);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useReferralCapture(user);
  usePlatformVisit(user?.uid, firebaseEnabled);
  useEffect(() => {
    if (!firebaseEnabled) return;
    try { return onAuthStateChanged(browserAuth(), current => { setUser(current); setReady(true); }, e => { setError(e.message); setReady(true); }); }
    catch { setError("Configurazione Firebase incompleta. Controlla le variabili NEXT_PUBLIC_FIREBASE_*."); setReady(true); }
  }, []);
  async function login() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      // Start directly from the user's tap, without an async preflight or a
      // redirect fallback: both can break sign-in on mobile browsers.
      await signInWithPopup(browserAuth(), new GoogleAuthProvider());
      window.location.replace("/");
    }
    catch (error) {
      const code = (error as { code?: string }).code;
      const messages: Record<string, string> = {
        "auth/popup-blocked": "Il browser ha bloccato la finestra Google. Consenti i popup per questo sito e riprova.",
        "auth/popup-closed-by-user": "Accesso Google non completato. Chiudi la finestra Google e riprova dal sito. Se il problema continua, apri il sito direttamente in Safari o Chrome.",
        "auth/unauthorized-domain": "Questo indirizzo non è autorizzato in Firebase Authentication. Aggiungi il dominio nelle impostazioni del progetto.",
        "auth/operation-not-allowed": "Il provider Google non è abilitato in Firebase Authentication.",
        "auth/network-request-failed": "Connessione a Firebase non riuscita. Controlla la connessione e riprova.",
        "auth/web-storage-unsupported": "Il browser non riesce a conservare la sessione di accesso. Apri il sito direttamente in Safari o Chrome e riprova.",
      };
      setError((code && messages[code]) || `Accesso non completato${code ? ` (${code})` : ""}. Riprova.`);
    }
    finally { setBusy(false); }
  }
  async function logout() {
    await signOut(browserAuth());
    setUser(null); setError("");
  }
  if (!firebaseEnabled) return <StudyProfileProvider><Workspace /></StudyProfileProvider>;
  if (!ready) return <main className="account-gate"><p>Caricamento del tuo spazio…</p></main>;
  if (!user) return <LoginScreen busy={busy} error={error} onLogin={() => void login()} />;
  return <StudyProfileProvider key={user.uid} onSignOut={logout}><Workspace /><LogoutHandler /></StudyProfileProvider>;
}
function LogoutHandler() {
  useEffect(() => {
    // Workspace flushes notes before actually signing out.
    const exit = () => { void signOut(browserAuth()); };
    window.addEventListener("margine-signout-ready", exit);
    return () => window.removeEventListener("margine-signout-ready", exit);
  }, []);
  return null;
}
