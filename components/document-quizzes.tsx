"use client";
import { openShare } from "@/lib/sharing-client";
import { cachedApi, invalidateApiCache } from "@/lib/browser-data-cache";

import { useEffect, useRef, useState } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Dialog from "@radix-ui/react-dialog";
import { ClipboardList, MoreHorizontal, Pencil, Trash2, Share2, X } from "lucide-react";
import { authHeaders } from "@/lib/firebase-client";
import type { QuizSummary, StudyQuiz } from "@/lib/quiz";
import { QuizCard } from "./quiz-card";
import { TonyMascot } from "./mascot/tony-mascot";
import { BaristaLoading } from "./barista-loading";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import styles from "./document-quizzes.module.css";

function QuizOpening() {
  return <BaristaLoading name="Il tuo quiz" statusText="Caricamento quiz in corso." hint="Tony sta preparando il tuo quiz." />;
}

export type PendingQuiz = { key: string; status: "pending" | "error"; error?: string; onRetry: () => void };
export function DocumentQuizzes({ documentId, documentName, pending = [], autoOpenQuizId, onAutoOpened }: { documentId: string; documentName: string; pending?: PendingQuiz[]; autoOpenQuizId?: string; onAutoOpened?: () => void }) {
  const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
  const [selected, setSelected] = useState<QuizSummary | null>(null);
  const [action, setAction] = useState<"open" | "rename" | "delete" | null>(null);
  const [quiz, setQuiz] = useState<StudyQuiz | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const mutation = useRef(false);
  const opening = useRef(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!autoOpenQuizId) return;
    choose({ id: autoOpenQuizId, documentId, title: "Il tuo quiz", questionCount: 0, createdAt: "" }, "open");
    onAutoOpened?.();
  }, [autoOpenQuizId]);
  async function request<T>(url: string, method = "GET", body?: unknown, signal?: AbortSignal) {
    return cachedApi<T>(url, { method, headers: { "Content-Type": "application/json", ...await authHeaders(), ...(method === "GET" && url.endsWith("/quiz") ? { "X-Studio-Quiz-Summaries": "1" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal });
  }
  useEffect(() => {
    let controller: AbortController | null = null;
    const load = () => {
      controller?.abort(); controller = new AbortController();
      void request<{ quizzes: QuizSummary[] }>(`/api/documents/${documentId}/quiz`, "GET", undefined, controller.signal).then(value => { setQuizzes(value.quizzes || []); setError(""); }).catch(cause => { if (cause.name !== "AbortError") setError("Impossibile caricare i quiz. Riapri il corso per riprovare."); });
    };
    load();
    const changed = (event: Event) => { if ((event as CustomEvent).detail?.documentId === documentId) void invalidateApiCache(`/api/documents/${documentId}/quiz`).then(load); };
    window.addEventListener("studio-quizzes-changed", changed);
    return () => { controller?.abort(); generation.current++; window.removeEventListener("studio-quizzes-changed", changed); };
  }, [documentId]);
  function choose(item: QuizSummary, next: "open" | "rename" | "delete", button?: HTMLButtonElement) {
    opening.current = true; if (button) trigger.current = button;
    setSelected(item); setAction(next); setTitle(item.title); setQuiz(null); setError("");
    const sequence = ++generation.current;
    if (next === "open") {
      setBusy(true);
      void request<StudyQuiz>(`/api/documents/${documentId}/quiz/${item.id}`).then(value => { if (generation.current === sequence) { setQuiz(value); setSelected({ id: value.id, documentId, title: value.title, questionCount: value.questions.length, createdAt: value.createdAt }); } }).catch(cause => { if (generation.current === sequence) setError(cause.message); }).finally(() => { if (generation.current === sequence) setBusy(false); });
    }
  }
  function close() { if (mutation.current) return; generation.current++; setAction(null); setBusy(false); setError(""); }
  async function save() {
    if (!selected || mutation.current) return;
    mutation.current = true; setBusy(true); setError("");
    try {
      await request(`/api/documents/${documentId}/quiz/${selected.id}`, action === "delete" ? "DELETE" : "PATCH", action === "rename" ? { title: title.trim() } : undefined);
      if (action === "delete") { try { localStorage.removeItem(`studio-quiz:${selected.id}`); } catch {} }
      window.dispatchEvent(new CustomEvent("studio-quizzes-changed", { detail: { documentId, quizId: selected.id, ...(action === "rename" ? { title: title.trim() } : { deleted: true }) } }));
      setAction(null);
    } catch (cause) { setError((cause as Error).message); }
    finally { mutation.current = false; setBusy(false); }
  }
  function menu(item: QuizSummary, context: boolean) {
    const Item = context ? ContextMenu.Item : DropdownMenu.Item;
    return <><Item className="material-menu-item" onSelect={() => { opening.current = true; openShare({ kind: "quiz", id: item.id, documentId, name: item.title }); }}><Share2 size={15} /> Condividi quiz</Item><Item className="material-menu-item" onSelect={() => choose(item, "open")}><ClipboardList size={15} /> Apri quiz</Item><Item className="material-menu-item" onSelect={() => choose(item, "rename")}><Pencil size={15} /> Rinomina</Item><Item className="material-menu-item" onSelect={() => choose(item, "delete")}><Trash2 size={15} /> Elimina quiz</Item></>;
  }
  const menuFocus = (event: Event) => { if (opening.current) { event.preventDefault(); opening.current = false; } };
  return <>
    {error && !action && <p role="alert" className="material-error">{error}</p>}
    {(!!quizzes.length || !!pending.length) && <ul className={styles.list} aria-label={`Quiz di ${documentName}`}>
      {pending.map(task => <li className={styles.pending} key={task.key} role="status"><TonyMascot size={42} animated={false} /><div><strong>{task.status === "pending" ? "Quiz in creazione" : "Creazione del quiz non riuscita"}</strong><small>{task.status === "pending" ? "Tony sta preparando le domande. Puoi continuare a studiare." : task.error}</small></div>{task.status === "pending" ? <span className={styles.pendingPulse} aria-label="Generazione in corso" /> : <button type="button" onClick={task.onRetry}>Riprova</button>}</li>)}
      {quizzes.map((item, index) => <li key={item.id}><ContextMenu.Root><ContextMenu.Trigger asChild><div className={styles.row}>
        <button className={styles.open} type="button" onClick={event => choose(item, "open", event.currentTarget)}><ClipboardList size={17} /><span><strong><span>Quiz {quizzes.length - index} - </span><span>{item.title}</span></strong><small>Quiz · {item.questionCount} {item.questionCount === 1 ? "domanda" : "domande"} · {item.timing ? "" : "~"}{Math.max(1, Math.ceil(item.timing ? item.timing.seconds * (item.timing.mode === "question" ? item.questionCount : 1) / 60 : item.questionCount))} min · {Number.isNaN(Date.parse(item.createdAt)) ? "Data non disponibile" : new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(item.createdAt))}</small></span></button>
        {item.latestResult && <span className={styles.result} data-passed={item.latestResult.passed} aria-label={item.latestResult.grade === null ? "Quiz completato" : `Ultimo punteggio: ${item.latestResult.grade} su 30`}><strong>{item.latestResult.grade === null ? "Completato" : `${item.latestResult.grade}/30`}</strong>{item.latestResult.total > 0 && <small>{item.latestResult.correct}/{item.latestResult.total}</small>}</span>}
        <DropdownMenu.Root><DropdownMenu.Trigger asChild><button className={styles.more} type="button" aria-label={`Azioni quiz ${item.title}`}><MoreHorizontal size={17} /></button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="material-menu-content" align="end" onCloseAutoFocus={menuFocus}>{menu(item, false)}</DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
      </div></ContextMenu.Trigger><ContextMenu.Portal><ContextMenu.Content className="material-menu-content" onCloseAutoFocus={menuFocus}>{menu(item, true)}</ContextMenu.Content></ContextMenu.Portal></ContextMenu.Root></li>)}
    </ul>}
    <Dialog.Root open={!!action} onOpenChange={open => { if (!open) close(); }}><Dialog.Portal><Dialog.Overlay className="plan-overlay" /><Dialog.Content className={`plan-dialog ${action === "open" ? styles.viewer : ""}`} onEscapeKeyDown={event => { if (mutation.current) event.preventDefault(); }} onPointerDownOutside={event => { if (mutation.current) event.preventDefault(); }} onCloseAutoFocus={event => { if (trigger.current?.isConnected) { event.preventDefault(); trigger.current.focus(); } }}>
      <div className={action === "open" ? styles.viewerHeader : undefined}><Dialog.Title>{action === "rename" ? "Rinomina quiz" : action === "delete" ? "Elimina quiz" : selected?.title}</Dialog.Title>
      <Dialog.Description>{action === "delete" ? "Il quiz verrà eliminato. Il PDF originale e gli appunti resteranno disponibili." : `Quiz collegato a ${documentName}`}</Dialog.Description>
      <Dialog.Close asChild><Button variant="ghost" size="icon" className="plan-dialog-close" aria-label="Chiudi quiz" disabled={mutation.current}><X size={18} /></Button></Dialog.Close></div>
      {action === "open" && (busy ? <QuizOpening /> : quiz && <QuizCard key={quiz.id} quiz={quiz} onClose={close} />)}
      {action === "rename" && <form className="plan-form" onSubmit={event => { event.preventDefault(); void save(); }}><label className="form-field"><span className="form-field-label">Nome del quiz</span><Input autoFocus value={title} onChange={event => setTitle(event.target.value)} maxLength={200} required disabled={busy} /></label><div className="plan-form-actions"><Button type="submit" disabled={busy || !title.trim()}>Salva nome</Button></div></form>}
      {action === "delete" && <div className="plan-form-actions"><Button variant="outline" onClick={close} disabled={busy}>Annulla</Button><Button onClick={() => void save()} disabled={busy}>Elimina quiz</Button></div>}
      {error && <p role="alert" className="plan-error">{error}</p>}
    </Dialog.Content></Dialog.Portal></Dialog.Root>
  </>;
}
