"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronUp, CircleAlert, LoaderCircle, Pause, Square } from "lucide-react";
import styles from "./analysis-island.module.css";

export interface AnalysisIslandJob {
  id: string;
  label: string;
  status: "checking" | "running" | "stopping" | "stopped" | "completed" | "error";
  completed: number;
  total: number;
  detail?: string;
  error?: string;
  onStop?: () => void;
}

const isActive = (job: AnalysisIslandJob) => ["checking", "running", "stopping"].includes(job.status);
const percentage = (job: Pick<AnalysisIslandJob, "completed" | "total">) => Math.min(100, Math.round(job.completed / Math.max(1, job.total) * 100));

function statusTitle(job: AnalysisIslandJob) {
  return job.status === "completed" ? "Tutte le spiegazioni sono pronte" : job.status === "stopped" ? "Analisi interrotta" : job.status === "error" ? "Analisi sospesa" : job.status === "stopping" ? "Salvo le pagine in corso…" : job.status === "checking" ? "Controllo le pagine salvate…" : "Tony sta analizzando";
}

export function AnalysisIsland({ jobs, embedded = false }: { jobs: AnalysisIslandJob[]; embedded?: boolean }) {
  const [hidden, setHidden] = useState(false);
  const activeJobs = jobs.filter(isActive);
  const active = activeJobs.length > 0;
  const job = activeJobs[0] || jobs.find(item => item.status === "error") || jobs.find(item => item.status === "stopped") || jobs[jobs.length - 1];
  if (!job) return null;
  const multiple = jobs.length > 1;
  const totals = jobs.reduce((sum, item) => ({ completed: sum.completed + item.completed, total: sum.total + item.total }), { completed: 0, total: 0 });
  const percent = percentage(totals);
  const title = multiple && active ? `Tony sta analizzando · ${activeJobs.length} in corso` : statusTitle(job);
  const Icon = active ? LoaderCircle : job.status === "completed" ? Check : job.status === "error" ? CircleAlert : Pause;

  if (hidden) return <button className={`${styles.restore} ${embedded ? styles.embeddedRestore : ""}`} onClick={() => setHidden(false)} aria-label="Mostra avanzamento analisi" aria-expanded={false} title={`${title} · ${percent}%`}><ChevronDown size={17} /><span className={active ? styles.dot : styles.finishedDot} /></button>;
  return <aside className={`${styles.island} ${embedded ? styles.embedded : ""}`} aria-label="Avanzamento analisi in background" data-active={active}>
    <div className={styles.summary}>
      <span className={styles.icon}><Icon size={18} className={active ? "spin" : undefined} /></span>
      <div className={styles.copy}><strong role="status" aria-live="polite">{title}</strong><span title={multiple ? `${jobs.length} analisi` : job.label}>{multiple ? `${jobs.length} analisi · ${totals.completed} / ${totals.total} pagine` : job.label}</span></div>
      <strong className={styles.percent}>{percent}%</strong>
      <button className={styles.hide} onClick={() => setHidden(true)} aria-label="Riduci avanzamento analisi" aria-expanded={true} title="Riduci avanzamento"><ChevronUp size={16} /></button>
    </div>
    <progress className={styles.progress} max={Math.max(1, totals.total)} value={totals.completed} aria-label="Avanzamento globale analisi" />
    {multiple ? <ul className={styles.jobs} aria-label="Analisi per materia">{jobs.map(item => <li key={item.id} aria-label={`Analisi ${item.label}`}>
      <div className={styles.jobHeading}><strong title={item.label}>{item.label}</strong><span>{percentage(item)}%</span></div>
      <div className={styles.footer}><span title={item.error || statusTitle(item)}>{item.error || (isActive(item) ? item.detail || statusTitle(item) : statusTitle(item))}</span>{isActive(item) && item.onStop && <button onClick={item.onStop} disabled={item.status === "stopping"} aria-label={`Interrompi analisi ${item.label}`} title="Interrompi solo questa analisi"><Square size={11} />{item.status === "stopping" ? "Attendi" : "Interrompi"}</button>}</div>
    </li>)}</ul> : <div className={styles.footer}><span>{job.error || job.detail || `${job.completed} / ${job.total} pagine`}</span>{active && job.onStop && <button onClick={job.onStop} disabled={job.status === "stopping"} aria-label="Interrompi analisi in background" title="Interrompi dopo le pagine in corso"><Square size={11} />{job.status === "stopping" ? "Attendi" : "Interrompi"}</button>}</div>}
  </aside>;
}
