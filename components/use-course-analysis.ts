"use client";
import { useEffect, useRef, useState } from "react";
import { readApiResponse } from "@/lib/api-response";
import { authHeaders } from "@/lib/firebase-client";
import type { DocumentSummary, SlideData, StudyDocument } from "@/lib/types";
import { runParallelFiles } from "@/lib/parallel-analysis";

type Status = "checking" | "running" | "stopping" | "stopped" | "completed" | "error";
export type CourseProgress = {
  folderId: string;
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
  canStart?: () => boolean;
  onRunningChange: (running: boolean) => void;
  onSlideSaved?: (id: string, page: number, slide: SlideData) => void;
  onProgressSaved: () => Promise<void> | void;
}

export function useCourseAnalysis({ folderId, documents, configured, disabled, canStart, onRunningChange, onProgressSaved, onSlideSaved }: CourseAnalysisControllerProps) {
  const [parallelism, setParallelism] = useState(3);
  const [progress, setProgress] = useState<CourseProgress | null>(null);
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
    if (lock.current || disabled || !configured || !files.length || canStart?.() === false) return;
    lock.current = true; stop.current = false; setError("");
    const requestController = new AbortController();
    controller.current = requestController;
    const startedAt = Date.now();
    let current: CourseProgress = {
      folderId, status: "checking", completed: totalPages - missingPages, total: totalPages,
      filesDone: 0, filesTotal: files.length, currentName: "",
      startedAt, secondsPerPage: 20, measured: false, parallelism, remainingByFile: files.map(file => Math.max(0, file.pages - file.analyzedPages)), active: [],
    };
    const update = (changes: Partial<CourseProgress>) => {
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
            onSlideSaved?.(document.id, page, result);
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
  return { parallelism, setParallelism, progress, error, now, running, start, stopAnalysis };
}

export type CourseAnalysisController = ReturnType<typeof useCourseAnalysis>;
