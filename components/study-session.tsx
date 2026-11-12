"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Eye, EyeOff, Pause, Play, Square } from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import { buildSavedSession, type SavedSessionInput, type SavedStudySession, type StudyHistorySnapshot } from "@/lib/study-history";
import type { DocumentSummary } from "@/lib/types";
import { cachedApi } from "@/lib/browser-data-cache";
import { authHeaders, browserAuth, firebaseEnabled } from "@/lib/firebase-client";
import { freshSession, pauseStudyTimer, startStudyTimer, recordStudyPage, restoreSession, sessionElapsed, studyDay, type StudySession } from "@/lib/study-session";
import styles from "./study-session.module.css";

type PendingAction = { type: "read"; documentId: string; page: number; day: string; read: boolean } | { type: "session"; session: SavedSessionInput } | { type: "import-activity"; activity: Record<string, number> };

export function useStudySession({ documents = [] }: { documents?: DocumentSummary[] } = {}) {
  const [session, setSession] = useState<StudySession>(() => freshSession());
  const [now, setNow] = useState(Date.now());
  const [hidden, setHidden] = useState(false);
  const [sessions, setSessions] = useState<SavedStudySession[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [savingHistory, setSavingHistory] = useState(false);
  const [errorHistory, setErrorHistory] = useState("");
  const current = useRef(session);
  const key = useRef("");
  const queue = useRef<PendingAction[]>([]);
  const syncing = useRef(false);
  const revision = useRef(0);
  const optimistic = useRef(new Map<string, boolean>());
  const names = useRef(documents); names.current = documents;
  const save = useCallback((next: StudySession) => {
    current.current = next; setSession(next);
    try { if (key.current) localStorage.setItem(key.current, JSON.stringify(next)); } catch {}
  }, []);
  const persistQueue = useCallback(() => { try { localStorage.setItem(`${key.current}:queue`, JSON.stringify(queue.current)); } catch {} }, []);
  const merge = useCallback((snapshot: StudyHistorySnapshot) => {
    setSessions(previous => [...new Map([...snapshot.sessions, ...previous.filter(item => queue.current.some(action => action.type === "session" && action.session.id === item.id))].map(item => [item.id, item])).values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)));
    const day = studyDay();
    const pages = new Set(snapshot.todayPages);
    for (const [page, read] of optimistic.current) { if (read) pages.add(page); else pages.delete(page); }
    save({ ...current.current, day, pages: [...pages], activity: { ...snapshot.activity, [day]: pages.size } });
  }, [save]);
  const reloadHistory = useCallback(async () => {
    const owner = key.current;
    if (!owner) return;
    setLoadingHistory(true);
    const requestedRevision = revision.current;
    try {
      const snapshot = await cachedApi<StudyHistorySnapshot>(`/api/study-sessions?day=${studyDay()}`, { headers: await authHeaders() });
      if (owner === key.current && requestedRevision === revision.current) { merge(snapshot); setErrorHistory(""); }
    } catch (error) { if (owner === key.current) setErrorHistory((error as Error).message); }
    finally { if (owner === key.current) setLoadingHistory(false); }
  }, [merge]);
  const flush = useCallback(async () => {
    if (syncing.current || !key.current) return;
    syncing.current = true; setSavingHistory(true);
    const owner = key.current;
    try {
      while (queue.current.length && key.current === owner) {
        const action = queue.current[0];
        await cachedApi(`/api/study-sessions?day=${studyDay()}`, { method: "POST", headers: { "Content-Type": "application/json", Prefer: "return=minimal", ...await authHeaders() }, body: JSON.stringify(action) });
        if (key.current !== owner) break;
        queue.current.shift(); revision.current++; persistQueue();
        // Keep newer optimistic changes when an older request completes.
        if (action.type === "read" && optimistic.current.get(`${action.documentId}:${action.page}`) === action.read && !queue.current.some(item => item.type === "read" && item.documentId === action.documentId && item.page === action.page)) optimistic.current.delete(`${action.documentId}:${action.page}`);
        setErrorHistory("");
      }
    } catch (error) { if (owner === key.current) setErrorHistory((error as Error).message); }
    finally {
      syncing.current = false; setSavingHistory(false);
      // Initial imports or queued writes can supersede the first history read.
      // Refresh after draining so today's counter also includes existing pages.
      if (owner === key.current && !queue.current.length) await reloadHistory();
    }
  }, [persistQueue, reloadHistory]);
  const enqueue = useCallback((action: PendingAction) => { revision.current++; queue.current.push(action); persistQueue(); void flush(); }, [flush, persistQueue]);
  useEffect(() => {
    function initialize(uid: string) {
      revision.current++;
      key.current = `studio-session:${uid}`;
      optimistic.current.clear();
      try {
        save(restoreSession(localStorage.getItem(key.current)));
        setHidden(localStorage.getItem(`${key.current}:hidden`) === "true");
        queue.current = JSON.parse(localStorage.getItem(`${key.current}:queue`) || "[]");
        for (const action of queue.current) if (action.type === "read" && action.day === studyDay()) optimistic.current.set(`${action.documentId}:${action.page}`, action.read);
        if (!localStorage.getItem(`${key.current}:imported`)) {
          const { [studyDay()]: _today, ...past } = current.current.activity;
          queue.current.unshift({ type: "import-activity", activity: past });
          for (const key of current.current.pages) { const split = key.lastIndexOf(":"); const documentId = key.slice(0, split); const page = Number(key.slice(split + 1)); queue.current.push({ type: "read", day: studyDay(), documentId, page, read: true }); optimistic.current.set(key, true); }
          localStorage.setItem(`${key.current}:imported`, "true"); persistQueue();
        }
      } catch { queue.current = []; }
      setSessions(queue.current.filter((action): action is Extract<PendingAction, { type: "session" }> => action.type === "session").map(action => buildSavedSession(action.session)));
      void reloadHistory(); void flush();
    }
    const unsubscribe = firebaseEnabled ? onAuthStateChanged(browserAuth(), user => { if (user) initialize(user.uid); else { key.current = ""; queue.current = []; optimistic.current.clear(); save(freshSession()); setSessions([]); setLoadingHistory(false); } }) : undefined;
    if (!firebaseEnabled) initialize("local");
    const timer = window.setInterval(() => {
      const time = Date.now(); setNow(time);
      if (current.current.day !== studyDay(new Date(time))) { optimistic.current.clear(); save({ ...current.current, day: studyDay(new Date(time)), activity: { ...current.current.activity, [current.current.day]: current.current.pages.length }, pages: [] }); void reloadHistory(); }
    }, 1000);
    const retry = () => { void flush(); void reloadHistory(); };
    window.addEventListener("online", retry);
    return () => { unsubscribe?.(); clearInterval(timer); window.removeEventListener("online", retry); };
  }, [flush, persistQueue, reloadHistory, save]);
  const recordRead = useCallback((id: string, page: number, read: boolean) => {
    revision.current++;
    optimistic.current.set(`${id}:${page}`, read);
    save(recordStudyPage(current.current, id, page, read));
  }, [save]);
  const commitRead = useCallback((id: string, page: number, read: boolean) => enqueue({ type: "read", documentId: id, page, read, day: studyDay() }), [enqueue]);
  function toggleTimer() {
    const time = Date.now(); setNow(time);
    const value = current.current;
    save(value.startedAt === null ? startStudyTimer(value, crypto.randomUUID(), time) : pauseStudyTimer(value, time));
  }
  function endSession() {
    const time = Date.now(); setNow(time);
    const value = current.current;
    const startedAt = value.activeStartedAt ?? value.startedAt;
    if (startedAt === null || startedAt === undefined) return;
    const saved: SavedSessionInput = { id: value.activeId || crypto.randomUUID(), startedAt: new Date(startedAt).toISOString(), endedAt: new Date(time).toISOString(), day: studyDay(new Date(startedAt)), durationMs: Math.max(0, Math.min(time - startedAt, 7 * 86400000, Math.floor(sessionElapsed(value, time)))), pages: (value.activePages || []).map(key => { const split = key.lastIndexOf(":"); const documentId = key.slice(0, split); return { documentId, page: Number(key.slice(split + 1)), name: names.current.find(document => document.id === documentId)?.name || "PDF" }; }) };
    save({ ...value, elapsedMs: 0, startedAt: null, activeStartedAt: undefined, activeId: undefined, activePages: [] });
    setSessions(previous => [buildSavedSession(saved), ...previous]);
    enqueue({ type: "session", session: saved });
  }
  function toggleVisibility() { setHidden(value => { try { localStorage.setItem(`${key.current}:hidden`, String(!value)); } catch {} return !value; }); }
  const hasReadToday = useCallback((id: string, page: number) => current.current.day === studyDay() && current.current.pages.includes(`${id}:${page}`), []);
  return { today: session.pages.length, todayDate: session.day, activity: session.activity, hasReadToday, elapsed: sessionElapsed(session, now), running: session.startedAt !== null, hasActiveSession: !!session.activeId || session.startedAt !== null, recordRead, commitRead, toggleTimer, endSession, resetTimer: endSession, hidden, toggleVisibility, sessions, loadingHistory, errorHistory, savingHistory, reloadHistory: async () => { await flush(); await reloadHistory(); } };
}

export function StudySessionBar({ session, document, portrait = false }: { portrait?: boolean; session: ReturnType<typeof useStudySession>; document?: { name: string; read: number; total: number } }) {
  const [mounted, setMounted] = useState(false);
  const [mobile, setMobile] = useState(false);
  useEffect(() => { setMounted(true); const media = window.matchMedia("(max-width:700px)"); const update = () => setMobile(media.matches); update(); media.addEventListener("change", update); return () => media.removeEventListener("change", update); }, []);
  if (!mounted) return null;
  const visibility = <button className={styles.restore} aria-label={session.hidden ? "Mostra riepilogo studio" : "Nascondi riepilogo studio"} aria-expanded={!session.hidden} title={session.hidden ? "Mostra riepilogo studio" : "Nascondi riepilogo studio"}>{session.hidden ? <Eye size={18} /> : <EyeOff size={18} />}</button>;
  const seconds = Math.floor(session.elapsed / 1000);
  const time = `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
  return <Popover.Root open={!session.hidden} onOpenChange={open => { if (open === session.hidden) session.toggleVisibility(); }}><Popover.Trigger asChild>{visibility}</Popover.Trigger><Popover.Portal><Popover.Content role="region" aria-label="Controlli della sessione" className={styles.floating} side="bottom" align="center" sideOffset={mobile && portrait ? 76 : 8} collisionPadding={8} onOpenAutoFocus={event => event.preventDefault()} onInteractOutside={event => event.preventDefault()}>
    <section className={styles.bar} aria-label="Riepilogo studio">
    <div className={styles.count}><strong>{session.today}</strong><span>pag oggi</span></div>
    <div className={styles.timer}><span role="timer" aria-label="Tempo di studio">{time}</span><button onClick={session.toggleTimer} disabled={session.running} aria-label="Play" title="Avvia o riprendi timer"><Play size={13} /><span className={styles.actionLabel}>Play</span></button><button onClick={session.toggleTimer} disabled={!session.running} aria-label="Pausa" title="Metti in pausa"><Pause size={13} /><span className={styles.actionLabel}>Pausa</span></button><button onClick={session.endSession} disabled={!session.hasActiveSession} aria-label="Fine sessione" title="Termina e salva la sessione"><Square size={12} /><span>Fine sessione</span></button></div>
    {document && <div className={styles.document} title={document.name}><strong>{document.read}<span> / {document.total}</span></strong><span>pag PDF</span></div>}
    {session.errorHistory && <button onClick={() => void session.reloadHistory()} title={session.errorHistory} aria-label="Riprova salvataggio sessioni">Riprova salvataggio</button>}

  </section>
  </Popover.Content></Popover.Portal></Popover.Root>;
}
