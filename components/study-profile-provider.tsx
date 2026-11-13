"use client";

import { cachedApi } from "@/lib/browser-data-cache";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { LoaderCircle, LogOut, X } from "lucide-react";
import { authHeaders } from "@/lib/firebase-client";
import { needsProfileOnboarding } from "@/lib/profile-onboarding";
import type { StudyProfile } from "@/lib/types";
import { Button } from "./ui/button";
import { UniversityPicker } from "./university-picker";
import { UsernameInput } from "./username-input";
import { StudyProgramPicker } from "./study-program-picker";
import pickerStyles from "./study-program-picker.module.css";
import { NicknamesProvider } from "./nicknames-provider";
import { BaristaLoading } from "./barista-loading";
import { TonyMascot } from "./mascot/tony-mascot";
import { ReferralWelcome } from "./referral-welcome";
import loginStyles from "./login-screen.module.css";

type StudyProfileContextValue = {
  profile: StudyProfile | null;
  loading: boolean;
  error: string;
  saveProfile: (studyProgram: string, onboardingCompleted?: boolean, displayName?: string, social?: { university: string; nickname: string; photoURL?: string }) => Promise<void>;
  reload: () => Promise<void>;
};

const StudyProfileContext = createContext<StudyProfileContextValue | null>(null);

async function profileRequest(init?: RequestInit): Promise<StudyProfile> {
  const result = await cachedApi<StudyProfile>("/api/profile", {
    ...init, headers: { "Content-Type": "application/json", ...await authHeaders() },
  });
  return result as StudyProfile;
}

export function StudyProfileProvider({ children, onSignOut, requireProfile = true }: { children: ReactNode; onSignOut?: () => Promise<void>; requireProfile?: boolean }) {
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

  const saveProfile = useCallback(async (studyProgram: string, onboardingCompleted?: boolean, displayName?: string, social?: { university: string; nickname: string; photoURL?: string }) => {
    if (saveLock.current) throw new Error("Salvataggio già in corso.");
    saveLock.current = true;
    const sequence = ++requestSequence.current;
    setError("");
    try {
      const result = await profileRequest({ method: "PATCH", body: JSON.stringify({ studyProgram: studyProgram.trim(), onboardingCompleted: onboardingCompleted ?? profile?.onboardingCompleted ?? true, ...(displayName !== undefined ? { displayName: displayName.trim() } : {}), ...social }) });
      if (sequence === requestSequence.current) { setProfile(result); window.dispatchEvent(new Event("studio-friends-changed")); }
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
    {!profile && requireProfile ? <main className={loading ? undefined : "study-profile-loading"} aria-busy={loading}>
      {loading ? <BaristaLoading fullScreen name="Il tuo profilo di studio" statusText="Caricamento del profilo di studio." hint="Un momento e possiamo iniziare." /> : <>
        <p role="alert">{error || "Il profilo di studio non è disponibile."}</p>
        <div className="profile-recovery-actions">
          <Button disabled={signingOut} onClick={() => void reload()}>Riprova</Button>
          {onSignOut && <Button variant="outline" disabled={signingOut} onClick={() => void leaveSession()}>{signingOut ? <LoaderCircle size={16} className="spin" /> : <LogOut size={16} />} {signingOut ? "Uscita in corso..." : "Esci e torna al login"}</Button>}
        </div>
      </>}
    </main> : <NicknamesProvider><ReferralWelcome>{children}{profile && requireProfile && <StudyOnboarding key={profile.studyProgram} profile={profile} saveProfile={saveProfile} />}</ReferralWelcome></NicknamesProvider>}
  </StudyProfileContext.Provider>;
}

export function useStudyProfile() {
  const value = useContext(StudyProfileContext);
  if (!value) throw new Error("useStudyProfile deve essere usato dentro StudyProfileProvider.");
  return value;
}

export function StudyOnboarding({ profile, saveProfile, onPreviewClose }: Pick<StudyProfileContextValue, "saveProfile"> & { profile: StudyProfile; onPreviewClose?: () => void }) {
  const [studyProgram, setStudyProgram] = useState(profile.studyProgram || "");
  const [university, setUniversity] = useState(profile.university || "");
  const [nickname, setNickname] = useState(profile.nickname || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);

  async function complete() {
    if (lock.current || !studyProgram.trim() || !nickname.trim() || !university.trim()) return;
    lock.current = true; setSaving(true); setError("");
    try { await saveProfile(studyProgram, true, undefined, { university, nickname }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Salvataggio non riuscito. Riprova."); }
    finally { lock.current = false; setSaving(false); }
  }

  return <Dialog.Root open={needsProfileOnboarding(profile)}>
    <Dialog.Portal>
      <Dialog.Overlay className="account-profile-overlay study-onboarding-overlay" />
      <Dialog.Content className={`${loginStyles.screen} ${loginStyles.onboardingScreen}`} onEscapeKeyDown={event => event.preventDefault()} onPointerDownOutside={event => event.preventDefault()} onInteractOutside={event => event.preventDefault()}>
        <span className={loginStyles.brand}>studio<span>.</span></span>
        {onPreviewClose && <button type="button" className={loginStyles.previewExit} onClick={onPreviewClose}><X size={16} aria-hidden="true" /> Esci dall’anteprima</button>}
        <div className={`${loginStyles.content} ${loginStyles.onboardingContent}`}>
        <div className={loginStyles.onboardingMascot} aria-hidden="true"><TonyMascot size="100%" /></div>
        <div className={loginStyles.greeting}><Dialog.Title asChild><h1>{profile.studyProgram.trim() ? "Completa il tuo profilo" : "Cosa studi?"}</h1></Dialog.Title></div>
        <Dialog.Description className={loginStyles.onboardingDescription}>Scegli il tuo username e indicaci dove studi.</Dialog.Description>
        <form className={`${pickerStyles.form} ${loginStyles.onboardingForm}`} onSubmit={event => { event.preventDefault(); void complete(); }}>
          <StudyProgramPicker id="onboarding-study-program" value={studyProgram} onChange={setStudyProgram} disabled={saving} autoFocus={!profile.studyProgram.trim()} />
          <div className="form-field"><label className="form-field-label" htmlFor="onboarding-university">Università</label><UniversityPicker id="onboarding-university" value={university} onChange={setUniversity} disabled={saving} /><small>Ti suggeriremo persone del tuo ateneo.</small></div>
          <div className="form-field"><label className="form-field-label" htmlFor="onboarding-nickname">Username</label><UsernameInput id="onboarding-nickname" value={nickname} onChange={setNickname} name={profile.displayName} disabled={saving} autoSuggest={!profile.nickname} /><small>Da 3 a 24 lettere, numeri, punti o underscore, per farti trovare dagli amici.</small></div>
          {error && <p className="profile-save-status" role="alert">{error}</p>}
          <div className="study-onboarding-actions">
            <Button type="submit" disabled={saving || !studyProgram.trim() || !nickname.trim() || !university.trim()}>{saving ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : null} Continua</Button>
          </div>
        </form>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
