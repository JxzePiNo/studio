"use client";

import { useEffect, useState } from "react";
import { TonyMascot } from "./mascot/tony-mascot";
import styles from "./barista-loading.module.css";

const actions = ["Lavando i bicchieri…", "Preparando uno spritz…", "Pulisco il pavimento…", "Lucidando il bancone…", "Montando il latte…", "Macinando il caffè…", "Sistemando i sottobicchieri…", "Shakerando le idee…"];

export function BaristaLoading({ name, error, onRetry }: { name: string; error?: string; onRetry: () => void }) {
  const [action, setAction] = useState(0);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (preference.matches || error) return;
    const timer = window.setInterval(() => setAction(index => (index + 1) % actions.length), 2400);
    return () => clearInterval(timer);
  }, [error]);
  return <div className={styles.loading} aria-busy={!error}>
    <div className={styles.mascot} aria-hidden="true"><TonyMascot size="100%" /></div>
    <p className={styles.name}>{name}</p>
    {error ? <><p className={styles.error} role="alert">{error}</p><button className={styles.retry} onClick={onRetry}>Riprova apertura</button></> : <><p key={action} className={styles.action} aria-hidden="true">{actions[action]}</p><span className="sr-only" role="status">Tony sta aprendo il PDF.</span><p className={styles.hint}>Tra poco il tuo materiale è qui.</p></>}
  </div>;
}
