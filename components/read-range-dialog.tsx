"use client";
import { trackedFetch } from "@/lib/browser-data-cache";

import { useId, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, LoaderCircle, X } from "lucide-react";
import { authHeaders } from "@/lib/firebase-client";
import { readApiResponse } from "@/lib/api-response";
import { studyDay } from "@/lib/study-session";
import type { DocumentSummary } from "@/lib/types";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import styles from "./read-range-dialog.module.css";

export function ReadRangeDialog({ document, onClose, onSaved }: { document: DocumentSummary; onClose: () => void; onSaved?: () => Promise<void> | void }) {
  const [from, setFrom] = useState("1");
  const [to, setTo] = useState(String(document.pages));
  const [period, setPeriod] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const hint = useId();
  const count = Math.max(0, Number(to) - Number(from) + 1);
  async function submit() {
    if (lock.current) return;
    lock.current = true; setSaving(true); setError("");
    try {
      const response = await trackedFetch(`/api/documents/${document.id}/read-range`, {
        method: "POST", headers: { "Content-Type": "application/json", Prefer: "return=minimal", ...await authHeaders() },
        body: JSON.stringify({ from: Number(from), to: Number(to), ...(period ? { startDate, endDate } : {}) }),
      });
      await readApiResponse(response);
      await onSaved?.();
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Salvataggio non riuscito. Riprova."); }
    finally { lock.current = false; setSaving(false); }
  }
  return <Dialog.Root open onOpenChange={open => { if (!open && !saving) onClose(); }}><Dialog.Portal><Dialog.Overlay className="plan-overlay" /><Dialog.Content className="plan-dialog" onCloseAutoFocus={event => { event.preventDefault(); window.document.querySelector<HTMLButtonElement>(`[data-document-id="${document.id}"] .material-open`)?.focus(); }} onEscapeKeyDown={event => { if (saving) event.preventDefault(); }} onPointerDownOutside={event => { if (saving) event.preventDefault(); }}>
    <Dialog.Title>Segna pagine lette</Dialog.Title>
    <Dialog.Description>Hai già studiato parte di {document.name}? Registra le pagine e, se vuoi, il periodo in cui le hai lette.</Dialog.Description>
    <Dialog.Close asChild><Button variant="ghost" size="icon" className="plan-dialog-close" aria-label="Chiudi pagine lette" disabled={saving}><X size={18} /></Button></Dialog.Close>
    <form className="plan-form" onSubmit={event => { event.preventDefault(); void submit(); }}>
      <div className={styles.range}><label className="form-field"><span className="form-field-label">Dalla pagina</span><Input type="number" min={1} max={document.pages} step={1} value={from} onChange={event => setFrom(event.target.value)} disabled={saving} required /></label><label className="form-field"><span className="form-field-label">Alla pagina</span><Input type="number" min={Number(from) || 1} max={document.pages} step={1} value={to} onChange={event => setTo(event.target.value)} disabled={saving} required /></label></div>
      <label className={styles.period}><input type="checkbox" checked={period} onChange={event => setPeriod(event.target.checked)} disabled={saving} />Indica quando le hai studiate <span>(facoltativo)</span></label>
      {period && <div className={styles.range}><label className="form-field"><span className="form-field-label">Dal giorno</span><Input type="date" value={startDate} max={endDate || studyDay()} onChange={event => setStartDate(event.target.value)} disabled={saving} required /></label><label className="form-field"><span className="form-field-label">Al giorno</span><Input type="date" value={endDate} min={startDate || undefined} max={studyDay()} onChange={event => setEndDate(event.target.value)} disabled={saving} required /></label></div>}
      <p className={styles.hint} id={hint}>{period ? "Le pagine vengono distribuite lungo il periodo scelto e aggiornano la griglia annuale. Le importazioni ripetute dello stesso intervallo e periodo non duplicano le pagine." : "Senza un periodo, le pagine vengono conteggiate come lette oggi."}</p>
      <div className={styles.summary} aria-describedby={hint}><Check size={16} /><span>{count} {count === 1 ? "pagina verrà segnata come letta" : "pagine verranno segnate come lette"} su {document.pages}.</span></div>
      {error && <p className="plan-error" role="alert">{error}</p>}
      <div className="plan-form-actions"><Dialog.Close asChild><Button variant="outline" disabled={saving}>Annulla</Button></Dialog.Close><Button type="submit" disabled={saving || count < 1}>{saving ? <><LoaderCircle size={15} className="spin" /> Salvataggio…</> : "Segna come lette"}</Button></div>
    </form>
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
