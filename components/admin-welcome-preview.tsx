"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import type { ReferralWelcome as Welcome } from "@/lib/referrals";
import type { StudyProfile } from "@/lib/types";
import { Button } from "./ui/button";
import { ReferralWelcome } from "./referral-welcome";
import { StudyOnboarding } from "./study-profile-provider";
import styles from "./admin-dashboard.module.css";

const profile: StudyProfile = { studyProgram: "", university: "", nickname: "", displayName: "Utente anteprima", onboardingCompleted: false, updatedAt: "" };

export function AdminWelcomeTools({ onStart }: { onStart: (data: Welcome) => void }) {
  const [name, setName] = useState("Iacopo Rossi");
  const [message, setMessage] = useState("Ciao! Benvenuto su Studio, ci vediamo al prossimo gruppo di studio!");
  function start(withGreeting: boolean) {
    onStart({ welcome: true, greeting: withGreeting ? { id: "00000000-0000-4000-8000-000000000001", fromName: name.trim(), text: message.trim(), sentAt: new Date().toISOString() } : null });
  }
  return <section className={styles.detail} aria-label="Anteprima benvenuto">
    <h2>Prova il benvenuto di Tony</h2>
    <p>Rivedi il benvenuto, il saluto dell’amico e le domande del profilo a tutta schermata. Puoi ripetere la prova quando vuoi: i dati inseriti non vengono salvati.</p>
    <form onSubmit={event => { event.preventDefault(); start(true); }}>
      <label className={styles.field}>Nome dell’amico<input value={name} onChange={event => setName(event.target.value)} maxLength={80} required /></label>
      <p className={styles.hint}>Verrà mostrato il soprannome, se disponibile, oppure il solo nome.</p>
      <label className={styles.field}>Saluto di prova<textarea value={message} onChange={event => setMessage(event.target.value)} maxLength={280} rows={3} required /></label>
      <div className={styles.controls}><Button type="submit" disabled={!name.trim() || !message.trim()}><Play size={16} /> Prova con saluto</Button><Button variant="outline" onClick={() => start(false)}>Prova senza saluto</Button></div>
    </form>
  </section>;
}

export function AdminWelcomePreview({ data, onClose }: { data: Welcome; onClose: () => void }) {
  return <ReferralWelcome preview={{ data, onClose }}><StudyOnboarding profile={profile} saveProfile={async () => onClose()} onPreviewClose={onClose} /></ReferralWelcome>;
}
