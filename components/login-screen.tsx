"use client";

import type { CSSProperties } from "react";
import { TonyMascot } from "./mascot/tony-mascot";
import styles from "./login-screen.module.css";

const introduction = "l'assistente AI pensato per studiare qualsiasi cosa";

export function LoginScreen({ busy, error, onLogin }: { busy: boolean; error: string; onLogin: () => void }) {
  return <main className={styles.screen}>
    <a className={styles.brand} href="/" aria-label="Studio, pagina iniziale">studio<span>.</span></a>
    <section className={styles.content} aria-labelledby="tony-greeting">
      <div className={styles.mascot} aria-hidden="true">
        <TonyMascot size="100%" />
      </div>
      <div className={styles.greeting}>
        <h1 id="tony-greeting">Ciao sono <span>Tony<span className={styles.period}>,</span></span></h1>
        <p className={styles.introduction} aria-label={introduction}>
          {introduction.split(" ").map((word, index) => <span aria-hidden="true" key={index} style={{ "--word": index } as CSSProperties}>{word}{" "}</span>)}
          <span className="sr-only">{introduction}</span>
        </p>
      </div>
      <button className={styles.googleButton} type="button" onClick={onLogin} disabled={busy} aria-busy={busy}>
        <GoogleLogo />
        <span>{busy ? "Accesso in corso…" : "Accedi con Google"}</span>
      </button>
      <p className={styles.note}>Il tuo spazio per imparare, una domanda alla volta.</p>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </section>
  </main>;
}

function GoogleLogo() {
  return <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#4285F4" d="M43.61 24.46c0-1.36-.12-2.66-.35-3.92H24v7.42h11a9.4 9.4 0 0 1-4.08 6.17v5h6.61c3.87-3.56 6.08-8.8 6.08-14.67Z" />
    <path fill="#34A853" d="M24 44c5.51 0 10.13-1.83 13.53-4.87l-6.61-5c-1.83 1.23-4.17 1.97-6.92 1.97-5.31 0-9.8-3.59-11.41-8.42H5.76v5.15A20.43 20.43 0 0 0 24 44Z" />
    <path fill="#FBBC05" d="M12.59 27.68a12.3 12.3 0 0 1 0-7.36v-5.15H5.76a20.25 20.25 0 0 0 0 17.66l6.83-5.15Z" />
    <path fill="#EA4335" d="M24 11.9c3 0 5.69 1.03 7.81 3.06l5.85-5.85C34.12 5.82 29.5 4 24 4A20.43 20.43 0 0 0 5.76 15.17l6.83 5.15C14.2 15.49 18.69 11.9 24 11.9Z" />
  </svg>;
}
