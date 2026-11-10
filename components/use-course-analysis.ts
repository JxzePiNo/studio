"use client";
import { useEffect, useRef, useState } from "react";
import { readApiResponse } from "@/lib/api-response";
import { authHeaders } from "@/lib/firebase-client";
import type { DocumentSummary, SlideData, StudyDocument } from "@/lib/types";
import { runParallelFiles } from "@/lib/parallel-analysis";

type Status = "checking" | "running" | "stopping" | "stopped" | "completed" | "error";
export type CourseProgress = {
  folderId: string;
  documentIds: string[];
  error?: string;
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

interface CourseAnalysisControllerProps {
  folderId: string;
  documents: DocumentSummary[];
  configured: boolean;
  disabled: boolean;
  canStart?: (documentIds: string[]) => boolean;
  onSlideSaved?: (id: string, page: number, slide: SlideData) => void;
  onProgressSaved: () => Promise<void> | void;
}

export function useCourseAnalysis({ folderId, documents, configured, disabled, canStart, onProgressSaved, onSlideSaved }: CourseAnalysisControllerProps) {
  const [jobs, setJobs] = useState<CourseProgress[]>([]);
  const [now, setNow] = useState(Date.now());
  const runtimes = useRef(new Map<string, { stop: boolean; controller: AbortController; documentIds: string[] }>());
  const mounted = useRef(true);
  const progress = jobs.find(job => job.folderId === folderId) || null;
  const error = progress?.error || "";
  const isActive = (job: CourseProgress) => ["checking", "running", "stopping"].includes(job.status);
  const running = !!progress && isActive(progress);
  const anyRunning = jobs.some(isActive);
  const isDocumentRunning = (id: string) => [...runtimes.current.values()].some(runtime => runtime.documentIds.includes(id));
  const files = documents.filter(document => document.folderId === folderId);
  const totalPages = files.reduce((sum, document) => sum + document.pages, 0);
  const missingPages = files.reduce((sum, document) => sum + Math.max(0, document.pages - document.analyzedPages), 0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const runtime of runtimes.current.values()) { runtime.stop = true; runtime.controller.abort(); }
      runtimes.current.clear();
    };
  }, []);
  useEffect(() => {
    if (!anyRunning) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [anyRunning]);

  async function start() {
    const documentIds = files.map(file => file.id);
    if (runtimes.current.has(folderId) || disabled || !configured || !files.length || documentIds.some(isDocumentRunning) || canStart?.(documentIds) === false) return;
    const requestController = new AbortController();
    const runtime = { stop: false, controller: requestController, documentIds };
    runtimes.current.set(folderId, runtime);
    const parallelism = Math.max(1, files.filter(file => file.analyzedPages < file.pages).length);
    const startedAt = Date.now();
    let current: CourseProgress = {
      folderId, documentIds, status: "checking", completed: totalPages - missingPages, total: totalPages,
      filesDone: 0, filesTotal: files.length, currentName: "",
      startedAt, secondsPerPage: 20, measured: false, parallelism, remainingByFile: files.map(file => Math.max(0, file.pages - file.analyzedPages)), active: [],
    };
    const update = (changes: Partial<CourseProgress>) => {
      current = { ...current, ...changes };
      if (runtime.stop && isActive(current)) current = { ...current, status: "stopping" };
      const snapshot = current;
      if (mounted.current) setJobs(jobs => jobs.some(job => job.folderId === folderId) ? jobs.map(job => job.folderId === folderId ? snapshot : job) : [...jobs, snapshot]);
    };
    update({}); setNow(startedAt);
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
        if (runtime.stop) break;
        update({ currentName: file.name });
        const document = await request<StudyDocument>(`/api/documents/${file.id}`);
        if (document.folderId !== folderId) throw new Error(`“${file.name}” è stato spostato in un altro esame. Aggiorna i materiali e riprova.`);
        loaded.push(document);
      }
      if (runtime.stop) { update({ status: "stopped", currentName: "" }); return; }
      const cached = (document: StudyDocument) => Object.entries(document.slides).filter(([page, slide]) => Number(page) >= 1 && Number(page) <= document.pages && slide.explanation).length;
      update({
        status: "running", parallelism: Math.max(1, loaded.filter(document => cached(document) < document.pages).length), total: loaded.reduce((sum, document) => sum + document.pages, 0),
        completed: loaded.reduce((sum, document) => sum + cached(document), 0),
        filesDone: loaded.filter(document => cached(document) === document.pages).length,
        remainingByFile: loaded.map(document => document.pages - cached(document)),
      });
      await runParallelFiles(loaded.filter(document => cached(document) < document.pages), current.parallelism, async (document, shouldStop) => {
        try {
          for (let page = 1; page <= document.pages; page++) {
            if (shouldStop()) break;
            if (document.slides[page]?.explanation) continue;
            active.set(document.id, { id: document.id, name: document.name, page });
            update({ status: runtime.stop ? "stopping" : "running", active: [...active.values()] });
            const pageStartedAt = Date.now();
            const result = await request<SlideData>(`/api/documents/${document.id}/analyze`, page);
            if (!result.explanation) throw new Error("La pagina non ha restituito una spiegazione valida. Riprova.");
            document.slides[page] = result;
            onSlideSaved?.(document.id, page, result);
            timings.push((Date.now() - pageStartedAt) / 1000);
            if (timings.length > 12) timings.shift();
            active.delete(document.id);
            update({
              status: runtime.stop ? "stopping" : "running", active: [...active.values()], completed: current.completed + 1,
              filesDone: loaded.filter(file => cached(file) === file.pages).length,
              remainingByFile: loaded.map(file => file.pages - cached(file)),
              secondsPerPage: timings.reduce((sum, seconds) => sum + seconds, 0) / timings.length,
              measured: true,
            });
          }
        } finally { active.delete(document.id); update({ active: [...active.values()] }); }
      }, () => runtime.stop);
      update({ status: runtime.stop && current.completed < current.total ? "stopped" : "completed", currentName: "" });
    } catch (error) {
      if (mounted.current) {
        update({ status: "error", active: [], error: `${(error as Error).message} Le spiegazioni già completate restano salvate.` });
      }
    } finally {
      if (runtimes.current.get(folderId) === runtime) runtimes.current.delete(folderId);
      if (mounted.current) setNow(Date.now());
      await refreshProgress().catch(() => {});
    }
  }

  function stopAnalysis(targetFolderId = folderId) {
    const runtime = runtimes.current.get(targetFolderId);
    if (!runtime) return;
    runtime.stop = true;
    setJobs(jobs => jobs.map(job => job.folderId === targetFolderId && isActive(job) ? { ...job, status: "stopping" } : job));
  }
  function stopAll() { for (const id of runtimes.current.keys()) stopAnalysis(id); }
  return { progress, error, now, running, jobs, anyRunning, isDocumentRunning, start, stopAnalysis, stopAll };
}

export type CourseAnalysisController = ReturnType<typeof useCourseAnalysis>;
