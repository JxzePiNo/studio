"use client";

import { useState } from "react";
import { Check, CircleAlert, Eye, EyeOff, LoaderCircle, Pause, Square } from "lucide-react";
import styles from "./analysis-island.module.css";

export interface AnalysisIslandJob {
  id: string;
  label: string;
  status: "checking" | "running" | "stopping" | "stopped" | "completed" | "error";
  completed: number;
  total: number;
  detail?: string;
  error?: string;
}

export function AnalysisIsland({ job, onStop }: { job: AnalysisIslandJob; onStop?: () => void }) {
  const [hidden, setHidden] = useState(false);
  const active = ["checking", "running", "stopping"].includes(job.status);
  const percent = Math.min(100, Math.round(job.completed / Math.max(1, job.total) * 100));
  const title = job.status === "completed" ? "Tutte le spiegazioni sono pronte" : job.status === "stopped" ? "Analisi interrotta" : job.status === "error" ? "Analisi sospesa" : job.status === "stopping" ? "Salvo le pagine in corso…" : job.status === "checking" ? "Controllo le pagine salvate…" : "Tony sta analizzando";
  const Icon = active ? LoaderCircle : job.status === "completed" ? Check : job.status === "error" ? CircleAlert : Pause;

  if (hidden) return <button className={styles.restore} onClick={() => setHidden(false)} aria-label="Mostra avanzamento analisi" title={`${title} · ${percent}%`}><Eye size={17} /><span className={active ? styles.dot : styles.finishedDot} /></button>;
  return <aside className={styles.island} aria-label="Avanzamento analisi in background" data-active={active}>
    <div className={styles.summary}>
      <span className={styles.icon}><Icon size={18} className={active ? "spin" : undefined} /></span>
      <div className={styles.copy}><strong role="status" aria-live="polite">{title}</strong><span title={job.label}>{job.label}</span></div>
      <strong className={styles.percent}>{percent}%</strong>
      <button className={styles.hide} onClick={() => setHidden(true)} aria-label="Nascondi avanzamento analisi" title="Nascondi avanzamento"><EyeOff size={16} /></button>
    </div>
    <progress className={styles.progress} max={Math.max(1, job.total)} value={job.completed} aria-label="Avanzamento globale analisi" />
    <div className={styles.footer}><span>{job.error || job.detail || `${job.completed} / ${job.total} pagine`}</span>{active && onStop && <button onClick={onStop} disabled={job.status === "stopping"} aria-label="Interrompi analisi in background" title="Interrompi dopo le pagine in corso"><Square size={11} />{job.status === "stopping" ? "Attendi" : "Interrompi"}</button>}</div>
  </aside>;
}
