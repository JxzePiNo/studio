"use client";

import { readApiResponse } from "@/lib/api-response";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { GraduationCap, LoaderCircle, LogOut } from "lucide-react";
import { authHeaders } from "@/lib/firebase-client";
import type { StudyProfile } from "@/lib/types";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

type StudyProfileContextValue = {
  profile: StudyProfile | null;
  loading: boolean;
  error: string;
  saveProfile: (studyProgram: string, onboardingCompleted?: boolean, displayName?: string) => Promise<void>;
  reload: () => Promise<void>;
};

const StudyProfileContext = createContext<StudyProfileContextValue | null>(null);

async function profileRequest(init?: RequestInit): Promise<StudyProfile> {
  const response = await fetch("/api/profile", {
    ...init,
    headers: { "Content-Type": "application/json", ...await authHeaders() },
    cache: "no-store",
  });
  const result = await readApiResponse<StudyProfile>(response, "Impossibile caricare il profilo di studio.");
  return result as StudyProfile;
}

export function StudyProfileProvider({ children, onSignOut }: { children: ReactNode; onSignOut?: () => Promise<void> }) {
  const [profile, setProfile] = useState<StudyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const signOutLock = useRef(false);
  const requestSequence = useRef(0);
  const saveLock = useRef(false);

  const reload = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setLoading(true); setError("");
    try {
      const result = await profileRequest();
      if (sequence === requestSequence.current) setProfile(result);
    } catch (cause) {
      if (sequence === requestSequence.current) setError(cause instanceof Error ? cause.message : "Impossibile caricare il profilo di studio.");
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    return () => { requestSequence.current++; };
  }, [reload]);

  const saveProfile = useCallback(async (studyProgram: string, onboardingCompleted?: boolean, displayName?: string) => {
    if (saveLock.current) throw new Error("Salvataggio già in corso.");
    saveLock.current = true;
    const sequence = ++requestSequence.current;
    setError("");
    try {
      const result = await profileRequest({ method: "PATCH", body: JSON.stringify({ studyProgram: studyProgram.trim(), onboardingCompleted: onboardingCompleted ?? profile?.onboardingCompleted ?? true, ...(displayName !== undefined ? { displayName: displayName.trim() } : {}) }) });
      if (sequence === requestSequence.current) setProfile(result);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Impossibile salvare il profilo di studio.";
      if (sequence === requestSequence.current) setError(message);
      throw new Error(message);
    } finally {
      saveLock.current = false;
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [profile?.onboardingCompleted]);

  async function leaveSession() {
    if (!onSignOut || signOutLock.current) return;
    signOutLock.current = true; setSigningOut(true);
    try { await onSignOut(); }
    catch { setError("Impossibile uscire dall'account. Riprova."); }
    finally { signOutLock.current = false; setSigningOut(false); }
  }

  return <StudyProfileContext.Provider value={{ profile, loading, error, saveProfile, reload }}>
    {!profile ? <main className="study-profile-loading" aria-busy={loading}>
      {loading ? <p role="status"><LoaderCircle size={18} className="spin" aria-hidden="true" /> Caricamento del profilo di studio…</p> : <>
        <p role="alert">{error || "Il profilo di studio non è disponibile."}</p>
        <div className="profile-recovery-actions">
          <Button disabled={signingOut} onClick={() => void reload()}>Riprova</Button>
          {onSignOut && <Button variant="outline" disabled={signingOut} onClick={() => void leaveSession()}>{signingOut ? <LoaderCircle size={16} className="spin" /> : <LogOut size={16} />} {signingOut ? "Uscita in corso..." : "Esci e torna al login"}</Button>}
        </div>
      </>}
    </main> : <>{children}<StudyOnboarding profile={profile} saveProfile={saveProfile} /></>}
  </StudyProfileContext.Provider>;
}

export function useStudyProfile() {
  const value = useContext(StudyProfileContext);
  if (!value) throw new Error("useStudyProfile deve essere usato dentro StudyProfileProvider.");
  return value;
}

function StudyOnboarding({ profile, saveProfile }: Pick<StudyProfileContextValue, "saveProfile"> & { profile: StudyProfile }) {
  const [studyProgram, setStudyProgram] = useState(profile.studyProgram || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);

  async function complete(skip = false) {
    if (lock.current || (!skip && !studyProgram.trim())) return;
    lock.current = true; setSaving(true); setError("");
    try { await saveProfile(skip ? "" : studyProgram, true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Salvataggio non riuscito. Riprova."); }
    finally { lock.current = false; setSaving(false); }
  }

  return <Dialog.Root open={!profile.onboardingCompleted}>
    <Dialog.Portal>
      <Dialog.Overlay className="account-profile-overlay study-onboarding-overlay" />
      <Dialog.Content className="account-profile-dialog study-onboarding-dialog" onEscapeKeyDown={event => event.preventDefault()} onPointerDownOutside={event => event.preventDefault()} onInteractOutside={event => event.preventDefault()}>
        <span className="study-onboarding-icon"><GraduationCap size={26} aria-hidden="true" /></span>
        <Dialog.Title>Cosa studi?</Dialog.Title>
        <Dialog.Description>Indicaci il tuo corso e il livello di studio, per esempio una laurea magistrale. Useremo questa informazione per adattare le spiegazioni e le risposte del tutor.</Dialog.Description>
        <form className="study-onboarding-form study-profile-form" onSubmit={event => { event.preventDefault(); void complete(); }}>
          <label htmlFor="onboarding-study-program">Corso di laurea o ambito di studio</label>
          <Input id="onboarding-study-program" aria-label="Corso di laurea o ambito di studio" value={studyProgram} onChange={event => setStudyProgram(event.target.value)} maxLength={300} placeholder="Es. Laurea magistrale in Ingegneria informatica" disabled={saving} autoFocus />
          <p className="study-profile-form-hint">Puoi modificarlo in qualsiasi momento da Account. Il testo verrà incluso nelle richieste al tutor AI.</p>
          {error && <p className="profile-save-status" role="alert">{error}</p>}
          <div className="study-onboarding-actions">
            <Button type="submit" disabled={saving || !studyProgram.trim()}>{saving ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : null} Inizia a studiare</Button>
            <Button variant="ghost" onClick={() => void complete(true)} disabled={saving}>Lo imposto dopo</Button>
          </div>
        </form>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
