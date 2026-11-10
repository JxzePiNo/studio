"use client";
import { trackedFetch } from "@/lib/browser-data-cache";

import { useRef, useState } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as Dialog from "@radix-ui/react-dialog";
import { authHeaders } from "@/lib/firebase-client";
import { readApiResponse } from "@/lib/api-response";
import { BookOpen, CalendarDays, Clock3, RotateCcw } from "lucide-react";
import { ReadingHeatmap } from "./reading-heatmap";
import { HomeGreeting } from "./home-greeting";
import { Button } from "./ui/button";
import greetingStyles from "./home-greeting.module.css";
import type { SavedStudySession } from "@/lib/study-history";
import styles from "./study-sessions-view.module.css";

type Props = { sessions: SavedStudySession[]; activity: Record<string, number>; today: string; loading?: boolean; error?: string; onRetry: () => void; selectedDay?: string | null; onSelectDay?: (day: string | null) => void };
const dateLabel = (date: string) => new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${date}T12:00:00`));
function duration(milliseconds: number) { const minutes = Math.floor(milliseconds / 60000); return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : minutes ? `${minutes} min` : `${Math.floor(milliseconds / 1000)} s`; }

export function StudySessionsView({ sessions, activity, today, loading = false, error, onRetry, selectedDay: externalDay, onSelectDay }: Props) {
  const [localDay, setLocalDay] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmation, setConfirmation] = useState<{ action: "delete" | "merge"; ids: string[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [mutationError, setMutationError] = useState("");
  const lock = useRef(false);
  const selection = selected.filter(id => sessions.some(session => session.id === id));
  function toggle(id: string) { setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]); }
  function confirm(action: "delete" | "merge", ids = selection) { setMutationError(""); setConfirmation({ action, ids }); }
  async function submit() {
    if (!confirmation || lock.current) return;
    lock.current = true; setSaving(true); setMutationError("");
    try {
      const response = await trackedFetch("/api/study-sessions", { method: confirmation.action === "delete" ? "DELETE" : "PATCH", headers: { "Content-Type": "application/json", ...await authHeaders() }, body: JSON.stringify({ ids: confirmation.ids, ...(confirmation.action === "merge" ? { action: "merge" } : {}) }) });
      await readApiResponse(response); setSelected([]); setConfirmation(null); onRetry();
    } catch (cause) { setMutationError(cause instanceof Error ? cause.message : "Operazione non riuscita. Riprova."); }
    finally { lock.current = false; setSaving(false); }
  }
  const selectedDay = externalDay === undefined ? localDay : externalDay;
  const selectDay = (day: string | null) => { setLocalDay(day); onSelectDay?.(day); };
  const visible = selectedDay ? sessions.filter(session => session.day <= selectedDay && (session.endDay || session.day) >= selectedDay) : sessions;
  const totalTime = visible.reduce((sum, session) => sum + session.durationMs, 0);
  const pages = selectedDay ? activity[selectedDay] || 0 : Object.values(activity).reduce((sum, count) => sum + count, 0);
  return <section className={`overview-page ${styles.view}`} aria-label="Sessioni di studio">
    <header className={greetingStyles.header}><HomeGreeting variant="sessions" /><Button className={greetingStyles.action} variant="outline" onClick={onRetry} disabled={loading} aria-label="Aggiorna sessioni"><RotateCcw size={16} /> Aggiorna</Button></header>
    {error && <p className={styles.error} role="alert">{error} <button onClick={onRetry}>Riprova salvataggio</button></p>}
    <ReadingHeatmap activity={activity} today={today} onSelectDay={selectDay} />
    <div className={styles.stats}><article><Clock3 size={18} /><strong>{duration(totalTime)}</strong><span>tempo di studio</span></article><article><BookOpen size={18} /><strong>{pages}</strong><span>pagine lette</span></article><article><CalendarDays size={18} /><strong>{visible.length}</strong><span>sessioni salvate</span></article></div>
    <div className={styles.listHeading}><h2>{selectedDay ? dateLabel(selectedDay) : "Le ultime sessioni"}</h2>{selectedDay && <button onClick={() => selectDay(null)}>Mostra tutte</button>}</div>
    {visible.length > 0 && <div className={styles.selectionBar}><label><input type="checkbox" checked={visible.every(session => selection.includes(session.id))} onChange={event => setSelected(event.target.checked ? [...new Set([...selection, ...visible.map(session => session.id)])].slice(0, 500) : selection.filter(id => !visible.some(session => session.id === id)))} /> Seleziona tutte</label><span>{selection.length} selezionate</span><Button variant="outline" disabled={selection.length < 2 || selection.length > 499 || saving} onClick={() => confirm("merge")}>Raggruppa</Button><Button variant="outline" disabled={!selection.length || saving} onClick={() => confirm("delete")}>Elimina</Button></div>}
    {loading && !sessions.length ? <p role="status">Caricamento delle sessioni…</p> : visible.length ? <ol className={styles.list}>{visible.map(session => <ContextMenu.Root key={session.id}><ContextMenu.Trigger asChild><li data-selected={selection.includes(session.id)}>
      <div className={styles.sessionHeading}><input type="checkbox" aria-label={`Seleziona sessione ${dateLabel(session.day)} ${new Date(session.startedAt).toLocaleTimeString("it-IT")}`} checked={selection.includes(session.id)} onChange={() => toggle(session.id)} disabled={!selection.includes(session.id) && selection.length >= 500} /><div><strong>{dateLabel(session.day)}{session.endDay && session.endDay !== session.day ? ` – ${dateLabel(session.endDay)}` : ""}</strong><span>{new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit" }).format(new Date(session.startedAt))} · {duration(session.durationMs)}{session.mergedCount ? ` · ${session.mergedCount} sessioni raggruppate` : ""}</span></div><span className={styles.pages}>{session.pagesRead} {session.pagesRead === 1 ? "pagina" : "pagine"}</span></div>
      {session.documents.length > 0 ? <ul className={styles.documents}>{session.documents.map(document => <li key={document.id}><BookOpen size={13} /><span>{document.name}</span><small>{document.pagesRead} {document.pagesRead === 1 ? "pagina" : "pagine"}</small></li>)}</ul> : <p className={styles.noPages}>Tempo dedicato allo studio, senza nuove pagine segnate come lette.</p>}
    </li></ContextMenu.Trigger><ContextMenu.Portal><ContextMenu.Content className={styles.contextMenu}><ContextMenu.Item disabled={!selection.includes(session.id) && selection.length >= 500} onSelect={() => toggle(session.id)}>{selection.includes(session.id) ? "Deseleziona sessione" : "Seleziona sessione"}</ContextMenu.Item><ContextMenu.Item disabled={(selection.includes(session.id) ? selection.length : selection.length + 1) < 2 || (selection.includes(session.id) ? selection.length : selection.length + 1) > 499} onSelect={() => confirm("merge", selection.includes(session.id) ? selection : [...selection, session.id])}>Raggruppa selezionate</ContextMenu.Item><ContextMenu.Item onSelect={() => confirm("delete", selection.includes(session.id) ? selection : [session.id])}>Elimina {selection.includes(session.id) && selection.length > 1 ? "selezionate" : "sessione"}</ContextMenu.Item></ContextMenu.Content></ContextMenu.Portal></ContextMenu.Root>)}</ol> : <div className={styles.empty}><Clock3 size={24} /><h3>{selectedDay ? "Nessuna sessione con timer in questo giorno." : "La prossima sessione inizia da qui."}</h3><p>Avvia il timer dal riepilogo in alto. Quando lo fermi, tempo e pagine studiate vengono salvati qui.</p></div>}
    <Dialog.Root open={!!confirmation} onOpenChange={open => { if (!open && !saving) setConfirmation(null); }}><Dialog.Portal><Dialog.Overlay className="plan-overlay" /><Dialog.Content className="plan-dialog" onEscapeKeyDown={event => { if (saving) event.preventDefault(); }} onPointerDownOutside={event => { if (saving) event.preventDefault(); }}><Dialog.Title>{confirmation?.action === "delete" ? "Eliminare le sessioni?" : "Raggruppare le sessioni?"}</Dialog.Title><Dialog.Description>{confirmation?.action === "delete" ? `Verranno eliminate ${confirmation.ids.length} registrazioni del timer. Le pagine lette e la griglia delle attività rimangono salvate. L’operazione non può essere annullata.` : `Le ${confirmation?.ids.length || 0} sessioni saranno sostituite da un unico gruppo, con pagine PDF senza duplicati e tempo sovrapposto contato una sola volta. Il periodo originale resta visibile; il gruppo compare nei giorni compresi nel periodo. Le attività di lettura rimangono salvate.`}</Dialog.Description>{mutationError && <p role="alert" className={styles.error}>{mutationError}</p>}<div className={styles.dialogActions}><Button variant="outline" disabled={saving} onClick={() => setConfirmation(null)}>Annulla</Button><Button disabled={saving} onClick={() => void submit()}>{saving ? "Salvataggio…" : confirmation?.action === "delete" ? "Elimina sessioni" : "Raggruppa sessioni"}</Button></div></Dialog.Content></Dialog.Portal></Dialog.Root>
    <p className={styles.note}>La griglia include anche le pagine lette senza timer. L’elenco mostra le ultime 500 sessioni salvate. Puoi raggruppare fino a 499 sessioni alla volta.</p>
  </section>;
}
