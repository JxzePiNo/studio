"use client";

import { useTonyPhrase } from "./use-tony-phrase";
import { TonyMascot } from "./mascot/tony-mascot";
import styles from "./barista-loading.module.css";

export function BaristaLoading({ name, error, onRetry, fullScreen = false, statusText = "Tony sta aprendo il PDF.", hint = "Tra poco il tuo materiale è qui." }: { name: string; error?: string; onRetry?: () => void; fullScreen?: boolean; statusText?: string; hint?: string }) {
  const { phrase } = useTonyPhrase("loading", 6500, !!error);
  return <div className={`${styles.loading}${fullScreen ? ` ${styles.fullScreen}` : ""}`} data-loading="tony" aria-busy={!error}>
    <div className={styles.mascot} aria-hidden="true"><TonyMascot size="100%" /></div>
    <p className={styles.name}>{name}</p>
    {error ? <><p className={styles.error} role="alert">{error}</p>{onRetry && <button className={styles.retry} onClick={onRetry}>Riprova apertura</button>}</> : <><p key={phrase} className={styles.action} aria-hidden="true">{phrase}</p><span className="sr-only" role="status">{statusText}</span><p className={styles.hint}>{hint}</p></>}
  </div>;
}
