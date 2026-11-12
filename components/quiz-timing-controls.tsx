"use client";

import type { QuizTiming } from "@/lib/quiz";
import { Input } from "./ui/input";
import styles from "./quiz.module.css";

export type QuizTimingDraft = { mode: "none" | QuizTiming["mode"]; questionSeconds: string; totalMinutes: string | null };
export const defaultQuizTiming: QuizTimingDraft = { mode: "question", questionSeconds: "60", totalMinutes: null };
export function configuredQuizTiming(draft: QuizTimingDraft, count: number): QuizTiming | undefined {
  return draft.mode === "none" ? undefined : { mode: draft.mode, seconds: draft.mode === "question" ? Number(draft.questionSeconds) : Number(draft.totalMinutes ?? count) * 60 };
}

export function QuizTimingControls({ value, onChange, count }: { value: QuizTimingDraft; onChange: (value: QuizTimingDraft) => void; count: number }) {
  return <fieldset className={styles.timingSettings}><legend>Come vuoi allenarti?</legend>
    <label className="form-field"><span className="form-field-label">Modalità timer</span><select value={value.mode} onChange={event => onChange({ ...value, mode: event.target.value as QuizTimingDraft["mode"] })}>
      <option value="question">A tempo per domanda</option><option value="total">Tempo totale del quiz</option><option value="none">Senza timer</option>
    </select></label>
    {value.mode === "question" && <label className="form-field"><span className="form-field-label">Secondi per domanda</span><Input type="number" min={1} max={86400} step={1} value={value.questionSeconds} onChange={event => onChange({ ...value, questionSeconds: event.target.value })} required /></label>}
    {value.mode === "total" && <label className="form-field"><span className="form-field-label">Minuti totali</span><Input type="number" min={1} max={1440} step={1} value={value.totalMinutes ?? count} onChange={event => onChange({ ...value, totalMinutes: event.target.value })} required /></label>}
    <p className={styles.hint}>{value.mode === "none" ? "Rispondi con calma, senza scadenze." : value.mode === "question" ? "Il tempo riparte a ogni domanda e si ferma mentre leggi la correzione. Alla scadenza viene confermata la risposta presente." : "Un unico conto alla rovescia, anche durante le correzioni. Alla scadenza il quiz viene consegnato."} {value.mode !== "none" && "Chiudere o ricaricare la pagina non azzera il tempo."}</p>
  </fieldset>;
}
