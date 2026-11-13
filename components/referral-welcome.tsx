"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowRight, X } from "lucide-react";
import { authHeaders } from "@/lib/firebase-client";
import { readApiResponse } from "@/lib/api-response";
import { referralRequest } from "@/lib/referral-client";
import type { ReferralWelcome as Welcome } from "@/lib/referrals";
import { useNickname } from "./nicknames-provider";
import { TonyMascot } from "./mascot/tony-mascot";
import { BaristaLoading } from "./barista-loading";
import styles from "./login-screen.module.css";

export function ReferralWelcome({ children, preview }: { children: ReactNode; preview?: { data: Welcome; onClose: () => void } }) {
  const [data, setData] = useState<Welcome | null>(preview?.data || null);
  const [step, setStep] = useState<"welcome" | "message" | "done">("welcome");
  const [saving, setSaving] = useState(false), [error, setError] = useState("");
  const lock = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const from = useNickname(data?.greeting?.fromName) || "Un amico";
  useEffect(() => {
    if (preview) return;
    const abort = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/referrals/greetings", { headers: await authHeaders(), signal: abort.signal, cache: "no-store" });
        const value = await readApiResponse<Welcome>(response);
        if (!abort.signal.aborted) { setData(value); if (!value.welcome && !value.greeting) setStep("done"); }
      } catch { if (!abort.signal.aborted) setStep("done"); }
    })();
    return () => abort.abort();
  }, [preview]);
  useEffect(() => { if (data && step !== "done") heading.current?.focus(); }, [data, step]);

  async function next() {
    if (!data || lock.current) return;
    if (step === "welcome" && data.greeting) { setStep("message"); return; }
    if (preview) { setStep("done"); return; }
    lock.current = true; setSaving(true); setError("");
    try { await referralRequest({ action: "welcome-complete", ...(step === "message" && data.greeting ? { greetingId: data.greeting.id } : {}) }); setStep("done"); }
    catch { setError("Non riesco a salvare il benvenuto. Riprova per continuare."); }
    finally { lock.current = false; setSaving(false); }
  }

  if (step === "done") return children;
  if (!data) return <main><BaristaLoading fullScreen name="Il tuo spazio" statusText="Caricamento del tuo spazio." hint="Un momento e possiamo iniziare." /></main>;
  const introduction = !data ? "Sto preparando il tuo spazio di studio." : step === "message" ? `${from} mi ha chiesto di portarti un saluto.` : "Sono Tony, il tuo compagno di studio. Qui ogni domanda è un buon punto di partenza.";
  return <main className={styles.screen}>
    <span className={styles.brand}>studio<span>.</span></span>
    {preview && <button type="button" className={styles.previewExit} onClick={preview.onClose}><X size={16} aria-hidden="true" /> Esci dall’anteprima</button>}
    <section key={data ? step : "loading"} className={styles.content} aria-labelledby="referral-welcome-title" aria-busy={!data}>
      <div className={styles.mascot} aria-hidden="true"><TonyMascot size="100%" mood="happy" /></div>
      <div className={styles.greeting}>
        <h1 id="referral-welcome-title" ref={heading} tabIndex={-1}>{!data ? "Un momento…" : step === "message" ? <>Un saluto da <span>{from}<span className={styles.period}>.</span></span></> : <>Benvenuto su <span>studio<span className={styles.period}>.</span></span></>}</h1>
        <p className={styles.introduction} aria-label={introduction}>{introduction.split(" ").map((word, index) => <span aria-hidden="true" key={index} style={{ "--word": index } as CSSProperties}>{word}{" "}</span>)}<span className="sr-only">{introduction}</span></p>
      </div>
      {step === "message" && <blockquote className={styles.friendMessage}>{data?.greeting?.text}</blockquote>}
      <button className={styles.googleButton} onClick={() => void next()} disabled={!data || saving}>{saving ? "Un momento…" : "Continua"}<ArrowRight size={18} aria-hidden="true" /></button>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </section>
  </main>;
}
