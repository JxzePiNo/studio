"use client";

import { readApiResponse } from "@/lib/api-response";

import { useEffect, useRef, useState } from "react";
import { Check, LoaderCircle, Sparkles } from "lucide-react";
import { authHeaders } from "@/lib/firebase-client";
import type { DocumentSummary, SlideData, StudyDocument } from "@/lib/types";
import { Button } from "./ui/button";
import { MAX_PARALLEL_FILES, parallelPageRounds, runParallelFiles } from "@/lib/parallel-analysis";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

type Status = "checking" | "running" | "stopping" | "stopped" | "completed" | "error";
type Progress = {
  status: Status;
  completed: number;
  total: number;
  filesDone: number;
  filesTotal: number;
  currentName: string;
  startedAt: number;
  secondsPerPage: number;
  measured: boolean;
  parallelism: number;
  remainingByFile: number[];
  active: { id: string; name: string; page: number }[];
};

interface CourseAnalysisProps {
  folderId: string;
  documents: DocumentSummary[];
  configured: boolean;
  disabled: boolean;
  onRunningChange: (running: boolean) => void;
  onProgressSaved: () => Promise<void> | void;
}

function duration(seconds: number) {
  const minutes = Math.ceil(Math.max(0, seconds) / 60);
  if (!minutes) return "meno di un minuto";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ""}`;
}

export function CourseAnalysis({ folderId, documents, configured, disabled, onRunningChange, onProgressSaved }: CourseAnalysisProps) {
  const [parallelism, setParallelism] = useState(3);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const lock = useRef(false);
  const stop = useRef(false);
  const mounted = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const files = documents.filter(document => document.folderId === folderId);
  const totalPages = files.reduce((sum, document) => sum + document.pages, 0);
  const missingPages = files.reduce((sum, document) => sum + Math.max(0, document.pages - document.analyzedPages), 0);
  const running = progress?.status === "checking" || progress?.status === "running" || progress?.status === "stopping";

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; stop.current = true; controller.current?.abort(); };
  }, []);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  async function start() {
    if (lock.current || disabled || !configured || !files.length) return;
    lock.current = true; stop.current = false; setError("");
    const requestController = new AbortController();
    controller.current = requestController;
    const startedAt = Date.now();
    let current: Progress = {
      status: "checking", completed: totalPages - missingPages, total: totalPages,
      filesDone: 0, filesTotal: files.length, currentName: "",
      startedAt, secondsPerPage: 20, measured: false, parallelism, remainingByFile: files.map(file => Math.max(0, file.pages - file.analyzedPages)), active: [],
    };
    const update = (changes: Partial<Progress>) => {
      current = { ...current, ...changes };
      if (mounted.current) setProgress(current);
    };
    update({}); setNow(startedAt); onRunningChange(true);
    async function request<T>(url: string, page?: number): Promise<T> {
      const response = await fetch(url, {
        method: page === undefined ? "GET" : "POST",
        headers: { ...await authHeaders(), ...(page === undefined ? {} : { "Content-Type": "application/json" }) },
        ...(page === undefined ? {} : { body: JSON.stringify({ page }) }),
        signal: requestController.signal,
      });
      const data = await readApiResponse<T>(response, "Analisi non riuscita. Riprova.");
      return data;
    }
    const timings: number[] = [];
    const active = new Map<string, { id: string; name: string; page: number }>();
    let pendingRefresh: Promise<void> | null = null;
    const refreshProgress = () => {
      if (!pendingRefresh) pendingRefresh = Promise.resolve().then(() => onProgressSaved()).then(() => {}).finally(() => { pendingRefresh = null; });
      return pendingRefresh;
    };
    try {
      const loaded: StudyDocument[] = [];
      for (const file of files) {
        if (stop.current) break;
        update({ currentName: file.name });
        const document = await request<StudyDocument>(`/api/documents/${file.id}`);
        if (document.folderId !== folderId) throw new Error(`“${file.name}” è stato spostato in un altro esame. Aggiorna i materiali e riprova.`);
        loaded.push(document);
      }
      if (stop.current) { update({ status: "stopped", currentName: "" }); return; }
      const cached = (document: StudyDocument) => Object.entries(document.slides).filter(([page, slide]) => Number(page) >= 1 && Number(page) <= document.pages && slide.explanation).length;
      update({
        status: "running", total: loaded.reduce((sum, document) => sum + document.pages, 0),
        completed: loaded.reduce((sum, document) => sum + cached(document), 0),
        filesDone: loaded.filter(document => cached(document) === document.pages).length,
        remainingByFile: loaded.map(document => document.pages - cached(document)),
      });
      await runParallelFiles(loaded.filter(document => cached(document) < document.pages), parallelism, async (document, shouldStop) => {
        try {
          for (let page = 1; page <= document.pages; page++) {
            if (shouldStop()) break;
            if (document.slides[page]?.explanation) continue;
            active.set(document.id, { id: document.id, name: document.name, page });
            update({ status: "running", active: [...active.values()] });
            const pageStartedAt = Date.now();
            const result = await request<SlideData>(`/api/documents/${document.id}/analyze`, page);
            if (!result.explanation) throw new Error("La pagina non ha restituito una spiegazione valida. Riprova.");
            document.slides[page] = result;
            timings.push((Date.now() - pageStartedAt) / 1000);
            if (timings.length > 12) timings.shift();
            active.delete(document.id);
            update({
              status: stop.current ? "stopping" : "running", active: [...active.values()], completed: current.completed + 1,
              filesDone: loaded.filter(file => cached(file) === file.pages).length,
              remainingByFile: loaded.map(file => file.pages - cached(file)),
              secondsPerPage: timings.reduce((sum, seconds) => sum + seconds, 0) / timings.length,
              measured: true,
            });
            await refreshProgress();
          }
        } finally { active.delete(document.id); update({ active: [...active.values()] }); }
      }, () => stop.current);
      await refreshProgress();
      update({ status: stop.current && current.completed < current.total ? "stopped" : "completed", currentName: "" });
    } catch (error) {
      if (mounted.current) {
        setError(`${(error as Error).message} Le spiegazioni già completate restano salvate.`);
        update({ status: "error", active: [] });
      }
    } finally {
      lock.current = false;
      controller.current = null;
      if (mounted.current) setNow(Date.now());
      onRunningChange(false);
    }
  }

  function stopAnalysis() {
    stop.current = true;
    setProgress(current => current ? { ...current, status: "stopping" } : current);
  }
  const remainingSeconds = progress ? parallelPageRounds(progress.remainingByFile, running ? progress.parallelism : parallelism) * progress.secondsPerPage : parallelPageRounds(files.map(file => Math.max(0, file.pages - file.analyzedPages)), parallelism) * 20;
  const complete = !running && files.length > 0 && missingPages === 0;

  return <section className="course-analysis" aria-label="Analisi di tutti i materiali">
    <div className="course-analysis-heading">
      <div><h2>Un esame, tutte le idee più chiare.</h2><p>{files.length} file · {totalPages} pagine · {missingPages} da analizzare</p></div>
      <div className="course-analysis-actions"><label className="analysis-parallelism"><span>File in parallelo</span><Select value={String(parallelism)} onValueChange={value => setParallelism(Number(value))} disabled={running || disabled}><SelectTrigger aria-label="File in parallelo"><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: MAX_PARALLEL_FILES }, (_, index) => index + 1).map(count => <SelectItem key={count} value={String(count)}>{count} {count === 1 ? "file alla volta" : "file insieme"}</SelectItem>)}</SelectContent></Select></label><Button onClick={() => void start()} disabled={running || disabled || !configured || !files.length || complete}>{running ? <LoaderCircle size={16} className="spin" /> : complete ? <Check size={16} /> : <Sparkles size={16} />}{running ? "Analisi in corso…" : complete ? "Tutto analizzato" : "Analizza tutto"}</Button>{running && <Button variant="outline" disabled={progress?.status === "stopping"} onClick={stopAnalysis}>{progress?.status === "stopping" ? "Interruzione richiesta…" : "Interrompi analisi"}</Button>}</div>
    </div>
    {!running && !complete && !!files.length && <p className="course-analysis-estimate">{!configured ? "Configura OpenAI per preparare le spiegazioni di tutti i materiali." : `Stima indicativa: circa ${duration(remainingSeconds)}. Le pagine già analizzate vengono riutilizzate.`}</p>}
    {progress && <div className="course-analysis-progress" role="status" aria-live="polite"><div className="course-analysis-progress-label"><span>{progress.status === "checking" ? `Controllo delle pagine salvate: ${progress.currentName}` : progress.status === "completed" ? "Analisi completata" : progress.status === "stopped" ? "Analisi interrotta. Puoi riprendere dalle pagine mancanti." : progress.status === "error" ? "Analisi sospesa. I progressi sono salvati." : progress.status === "stopping" ? "Salvo le pagine in corso, poi mi fermo." : `${progress.active.length} file in analisi / fino a ${progress.parallelism} in parallelo`}</span><strong>{progress.completed} / {progress.total} pagine · {progress.filesDone} / {progress.filesTotal} file</strong></div>{progress.active.length > 0 && <ul className="course-analysis-active" aria-label="File in analisi">{progress.active.map(file => <li key={file.id}><LoaderCircle size={13} className="spin" /><span>{file.name}</span><strong>Pagina {file.page}</strong></li>)}</ul>}<progress max={Math.max(1, progress.total)} value={progress.completed} aria-label="Pagine analizzate dell’esame" />{running && <p className="course-analysis-timing">Tempo trascorso: {duration(Math.max(0, (now - progress.startedAt) / 1000))} · Tempo rimanente stimato: circa {duration(remainingSeconds)}{!progress.measured ? " (stima iniziale)" : ""}</p>}{running && <small>Mantieni aperta questa scheda. La stima si aggiorna dopo ogni pagina completata.</small>}</div>}
    {error && <p className="course-analysis-error" role="alert">{error}</p>}
  </section>;
}
