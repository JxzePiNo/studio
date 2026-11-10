"use client";
import { Check, LoaderCircle, Sparkles } from "lucide-react";
import type { DocumentSummary } from "@/lib/types";
import { Button } from "./ui/button";
import { MAX_PARALLEL_FILES, parallelPageRounds } from "@/lib/parallel-analysis";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import type { CourseAnalysisController } from "./use-course-analysis";

function duration(seconds: number) {
  const minutes = Math.ceil(Math.max(0, seconds) / 60);
  if (!minutes) return "meno di un minuto";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ""}`;
}

export function CourseAnalysis({ folderId, documents, configured, disabled, controller }: {
  folderId: string; documents: DocumentSummary[]; configured: boolean; disabled: boolean; controller: CourseAnalysisController;
}) {
  const { parallelism, setParallelism, now, running, start, stopAnalysis } = controller;
  const progress = controller.progress?.folderId === folderId ? controller.progress : null;
  const error = progress ? controller.error : "";
  const files = documents.filter(document => document.folderId === folderId);
  const totalPages = files.reduce((sum, document) => sum + document.pages, 0);
  const missingPages = files.reduce((sum, document) => sum + Math.max(0, document.pages - document.analyzedPages), 0);
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
