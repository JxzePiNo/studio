"use client";

import { readApiResponse } from "@/lib/api-response";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, FileText, FolderOpen, Languages, LoaderCircle, Maximize2, Minus, Plus, Search, Sparkles, Upload, X } from "lucide-react";
import { authHeaders, firebaseEnabled } from "@/lib/firebase-client";
import { examColor } from "@/lib/exam-colors";
import * as Dialog from "@radix-ui/react-dialog";
import { SidebarProfile } from "./sidebar-profile";
import { ExamOverview } from "./exam-overview";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { CourseHeader } from "./course-header";
import { CourseAnalysis } from "./course-analysis";
import { useCourseAnalysis } from "./use-course-analysis";
import { AnalysisIsland, type AnalysisIslandJob } from "./analysis-island";
import { TonyMascot } from "./mascot/tony-mascot";
import homeStyles from "./home-greeting.module.css";
import { mergeAnalysisSlide } from "@/lib/merge-analysis-slide";
import { NewExamDialog } from "./new-exam-dialog";
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarTrigger } from "./ui/sidebar";
import { MaterialList } from "./material-list";
import { StudyChat } from "./study-chat";
import type { ExamFolder } from "@/lib/types";
import { loadPdf, PdfCanvas } from "./pdf-viewer";
import { BottomPanel } from "./bottom-panel";
import { ReaderSplit } from "./reader-split";
import type { DocumentSummary, SlideData, StudyDocument } from "@/lib/types";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { ...init?.headers, ...await authHeaders() } });
  const data = await readApiResponse<T>(response);
  return data;
}
const json = (method: string, data: unknown) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
const size = (bytes: number) => bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
type BatchProgress = { id: string; startedAt: number; total: number; completed: number; current: number | null; status: "running" | "stopping" | "stopped" | "completed" | "error" };

export default function Workspace() {
  const [folders, setFolders] = useState<ExamFolder[]>([]);
  const [folderId, setFolderId] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [library, setLibrary] = useState<DocumentSummary[]>([]);
  const [doc, setDoc] = useState<StudyDocument | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [textSize, setTextSize] = useState(16);
  useEffect(() => {
    try { const saved = Number(localStorage.getItem("studio-text-size")); if (saved >= 14 && saved <= 22) setTextSize(saved); } catch {}
  }, []);
  function changeTextSize(value: number) { setTextSize(value); try { localStorage.setItem("studio-text-size", String(value)); } catch {} }
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [batch, setBatch] = useState<BatchProgress | null>(null);
  const [pageJob, setPageJob] = useState<AnalysisIslandJob | null>(null);
  const [configured, setConfigured] = useState(false);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState(false);
  const [noteStatus, setNoteStatus] = useState("Salvato in locale");
  const [uploadProgress, setUploadProgress] = useState<{ completed: number; total: number; name: string; succeeded: number; failures: string[] } | null>(null);
  const uploadLock = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const docRef = useRef<StudyDocument | null>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const openSequence = useRef(0);
  const noteQueue = useRef<Promise<unknown>>(Promise.resolve());
  const noteVersion = useRef(0);
  const pendingNotes = useRef(new Map<string, { id: string; page: number; notes: string; version: number }>());
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingWrites = useRef(0);
  const analysisLock = useRef(false);
  const courseLock = useRef(false);
  const [courseRunning, setCourseRunning] = useState(false);
  const [analysisKind, setAnalysisKind] = useState<"course" | "reader">("course");
  const stopBatch = useRef(false);
  const viewer = useRef<HTMLDivElement>(null);
  const activeSlide = doc?.slides[page];
  const explanation = activeSlide?.explanation;
  const currentAnalyzing = analyzing === `${doc?.id}:${page}`;
  const batchRunning = batch?.status === "running" || batch?.status === "stopping";
  const analyzedCount = doc ? Object.values(doc.slides).filter(s => s.explanation).length : 0;

  useEffect(() => {
    if (!uploadProgress || uploadProgress.completed < uploadProgress.total) return;
    const timer = setTimeout(() => {
      setUploadProgress(current => current === uploadProgress ? null : current);
    }, 4000);
    return () => clearTimeout(timer);
  }, [uploadProgress]);

  const queueWrite = useCallback((write: () => Promise<unknown>) => {
    pendingWrites.current += 1;
    noteQueue.current = noteQueue.current.catch(() => {}).then(write).finally(() => { pendingWrites.current -= 1; });
  }, []);
  const flushNotes = useCallback(() => {
    if (noteTimer.current) { clearTimeout(noteTimer.current); noteTimer.current = null; }
    const changes = [...pendingNotes.current.values()];
    pendingNotes.current.clear();
    for (const { id, page: target, notes, version } of changes) {
      queueWrite(async () => {
        try {
          await api(`/api/documents/${id}`, json("PATCH", { page: target, notes }));
          const unsaved = pendingNotes.current.get(`${id}:${target}`);
          if (unsaved && unsaved.version <= version) pendingNotes.current.delete(`${id}:${target}`);
          if (version === noteVersion.current) setNoteStatus(firebaseEnabled ? "Salvato su Firebase" : "Salvato in locale");
        } catch (e) {
          const unsaved = pendingNotes.current.get(`${id}:${target}`);
          if (!unsaved || unsaved.version < version) pendingNotes.current.set(`${id}:${target}`, { id, page: target, notes, version });
          setNoteStatus("Salvataggio non riuscito");
          setError((e as Error).message);
        }
      });
    }
  }, [queueWrite]);

  useEffect(() => {
    const protectUnsaved = (event: BeforeUnloadEvent) => {
      if (pendingNotes.current.size || pendingWrites.current || analysisLock.current || courseLock.current || uploadLock.current) {
        flushNotes();
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", protectUnsaved);
    return () => { window.removeEventListener("beforeunload", protectUnsaved); flushNotes(); };
  }, [flushNotes]);

  const refreshSequence = useRef(0);
  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    const [documents, exams] = await Promise.all([api<DocumentSummary[]>("/api/documents"), api<ExamFolder[]>("/api/folders")]);
    if (sequence !== refreshSequence.current) return;
    setLibrary(documents); setFolders(exams);
  }, []);
  const courseAnalysis = useCourseAnalysis({
    folderId, documents: library, configured, disabled: busy || !!analyzing || !!batchRunning,
    canStart: () => !analysisLock.current && !uploadLock.current,
    onRunningChange: running => { courseLock.current = running; setCourseRunning(running); if (running) setAnalysisKind("course"); },
    onProgressSaved: refresh,
    onSlideSaved: (id, target, result) => mergeSlide(id, target, result, true),
  });
  const courseProgress = courseAnalysis.progress;
  const islandJob: AnalysisIslandJob | null = analysisKind === "course" && courseProgress ? {
    id: `course:${courseProgress.startedAt}`, label: folders.find(folder => folder.id === courseProgress.folderId)?.name || "Esame",
    status: courseProgress.status, completed: courseProgress.completed, total: courseProgress.total,
    detail: courseProgress.active.length ? `${courseProgress.active.length} file in analisi · ${courseProgress.completed} / ${courseProgress.total} pagine` : undefined,
    error: courseAnalysis.error,
  } : batch ? {
    id: `reader:${batch.id}:${batch.startedAt}`, label: library.find(file => file.id === batch.id)?.name || "PDF",
    status: batch.status, completed: batch.completed, total: batch.total,
    detail: batch.current ? `Pagina ${batch.current} · ${batch.completed} / ${batch.total} pronte` : undefined,
  } : pageJob;

  useEffect(() => {
    void refresh().catch(e => setError(e.message));
    void api<{ configured: boolean }>("/api/status").then(s => setConfigured(s.configured)).catch(e => setError(e.message));
    return () => { void pdfRef.current?.destroy(); };
  }, [refresh]);

  useEffect(() => {
    const logout = () => {
      void (async () => {
        if (uploadLock.current) { setError("Attendi il completamento dei caricamenti prima di uscire."); return; }
        if (analysisLock.current || courseLock.current) { setError("Attendi la fine dell’analisi prima di uscire."); return; }
        flushNotes(); await noteQueue.current;
        if (pendingNotes.current.size) { setError("Salva gli appunti prima di uscire."); return; }
        window.dispatchEvent(new Event("margine-signout-ready"));
      })();
    };
    window.addEventListener("margine-signout", logout);
    return () => window.removeEventListener("margine-signout", logout);
  }, [flushNotes]);

  function changeLocation(folder: string, documentId?: string) {
    const path = folder ? `/esami/${folder}${documentId ? `/documenti/${documentId}` : ""}` : "/";
    if (window.location.pathname !== path) window.history.pushState(null, "", path);
  }
  function openFolder(id: string) {
    if (busy || uploadLock.current) return;
    changeLocation(id); setFolderId(id); setQuery(""); setSidebar(false);
  }
  const restoreRoute = useRef<(path: string) => Promise<void>>(async () => {});
  const routeQueue = useRef<Promise<void>>(Promise.resolve());
  const restoringRoute = useRef(false);
  useEffect(() => {
    const restore = () => {
      const path = window.location.pathname;
      routeQueue.current = routeQueue.current.catch(() => {}).then(() => restoreRoute.current(path));
    };
    restore(); window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  restoreRoute.current = async (path) => {
    const match = path.match(/^\/esami\/([^/]+)(?:\/documenti\/([^/]+))?\/?$/);
    if (uploadLock.current) {
      window.history.pushState(null, "", docRef.current ? `/esami/${docRef.current.folderId}/documenti/${docRef.current.id}` : folderId ? `/esami/${folderId}` : "/");
      setError("Attendi il completamento dell'operazione prima di cambiare pagina."); return;
    }
    restoringRoute.current = true;
    try {
      if (match?.[2]) await openDocument(match[2]);
      else { if (docRef.current) await closeDocument(true); if (!docRef.current) setFolderId(match?.[1] || ""); }
    } finally { restoringRoute.current = false; }
  };

  async function openDocument(id: string) {
    const sequence = ++openSequence.current;
    setBusy(true); setError(""); setSidebar(false);
    try {
      flushNotes();
      await noteQueue.current;
      if (pendingNotes.current.size) throw new Error("Gli appunti non sono ancora salvati. Riprova prima di cambiare documento.");
      const result = await api<StudyDocument>(`/api/documents/${id}`);
      const loaded = await loadPdf(`/api/documents/${id}/pdf`, await authHeaders());
      if (sequence !== openSequence.current) { await loaded.destroy(); return; }
      void pdfRef.current?.destroy(); pdfRef.current = loaded;
      if (!restoringRoute.current) changeLocation(result.folderId || folderId, id);
      docRef.current = result; setDoc(result); setFolderId(result.folderId || ""); setPdf(loaded); setPage(result.currentPage); setZoom(1);
      setNoteStatus(firebaseEnabled ? "Salvato su Firebase" : "Salvato in locale");
    } catch (e) { if (sequence === openSequence.current) setError((e as Error).message); }
    finally { if (sequence === openSequence.current) setBusy(false); }
  }

  async function uploadFiles(selection: FileList | File[] | null) {
    const files = Array.from(selection || []);
    if (!files.length || uploadLock.current || busy) return;
    if (!folderId || !folders.some(f => f.id === folderId)) { setError("Apri un esame prima di caricare i PDF."); return; }
    const targetFolder = folderId;
    uploadLock.current = true; setBusy(true); setError("");
    let succeeded = 0; let singleId = "";
    const failures: string[] = [];
    setUploadProgress({ completed: 0, total: files.length, name: files[0].name, succeeded: 0, failures: [] });
    try {
      flushNotes(); await noteQueue.current;
      if (pendingNotes.current.size) throw new Error("Salva gli appunti prima di caricare altri materiali.");
      for (let index = 0; index < files.length; index++) {
        const file = files[index];
        setUploadProgress({ completed: index, total: files.length, name: file.name, succeeded, failures: [...failures] });
        try {
          if (!file.name.toLowerCase().endsWith(".pdf") || !file.size || file.size > 30 * 1024 * 1024) throw new Error("Scegli un PDF non vuoto di massimo 30 MB.");
          const form = new FormData(); form.append("file", file); form.append("folderId", targetFolder);
          const result = await api<StudyDocument>("/api/documents", { method: "POST", body: form });
          succeeded++; singleId = result.id;
        } catch(e) { failures.push(file.name + ": " + (e as Error).message); }
        setUploadProgress({ completed: index + 1, total: files.length, name: file.name, succeeded, failures: [...failures] });
      }
      await refresh();
      if (failures.length) setError(failures.join(" · "));
      if (files.length === 1 && succeeded) { setUploadProgress(null); await openDocument(singleId); }
      else if (succeeded && docRef.current) await closeDocument();
    } catch(e) { setError((e as Error).message); }
    finally { uploadLock.current = false; setBusy(false); if (input.current) input.current.value = ""; }
  }

  const navigate = useCallback((target: number) => {
    const current = docRef.current;
    if (busy || !current || target < 1 || target > current.pages) return;
    setPage(target); setZoom(1);
    current.currentPage = target;
    flushNotes();
    queueWrite(async () => {
      try { await api(`/api/documents/${current.id}`, json("PATCH", { page: target })); }
      catch (e) { setError((e as Error).message); }
    });
  }, [busy, flushNotes, queueWrite]);

  const toggleRead = useCallback(() => {
    const current = docRef.current;
    if (!current || busy) return;
    const target = page;
    const read = !current.slides[target]?.read;
    const updated = { ...current, slides: { ...current.slides, [target]: { ...current.slides[target], notes: current.slides[target]?.notes || "", read } } };
    docRef.current = updated; setDoc(updated);
    queueWrite(async () => {
      try { await api(`/api/documents/${current.id}`, json("PATCH", { page: target, read })); await refresh(); }
      catch (e) {
        if (docRef.current?.id === current.id && docRef.current.slides[target]?.read === read) {
          const rollback = { ...docRef.current, slides: { ...docRef.current.slides, [target]: { ...docRef.current.slides[target], read: !read } } };
          docRef.current = rollback; setDoc(rollback);
        }
        setError((e as Error).message);
      }
    });
  }, [busy, page, queueWrite, refresh]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest("input, textarea, button, a, select, [contenteditable], [role=dialog], [role=menu], [role=separator]")) return;
      if (settings || event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
      if (event.code === "Space" && docRef.current) { event.preventDefault(); toggleRead(); }
      if (event.key === "ArrowRight") { event.preventDefault(); navigate(page + 1); }
      if (event.key === "ArrowLeft") { event.preventDefault(); navigate(page - 1); }
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [page, navigate, settings, toggleRead]);

  function saveNotes(notes: string) {
    if (!doc || busy) return;
    const id = doc.id; const target = page; const version = ++noteVersion.current;
    const updated = { ...doc, slides: { ...doc.slides, [target]: { ...doc.slides[target], notes } } };
    docRef.current = updated; setDoc(updated); setNoteStatus("Salvataggio…");
    pendingNotes.current.set(`${id}:${target}`, { id, page: target, notes, version });
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(flushNotes, 350);
  }

  function mergeSlide(id: string, target: number, result: SlideData, analysisResult = false) {
    if (docRef.current?.id !== id) return;
    const slide = analysisResult ? mergeAnalysisSlide(docRef.current.slides[target], result) : { ...result, ...(docRef.current.slides[target]?.read !== undefined ? { read: docRef.current.slides[target].read } : {}), notes: docRef.current.slides[target]?.notes ?? result.notes ?? "" };
    const updated = { ...docRef.current, slides: { ...docRef.current.slides, [target]: slide } };
    docRef.current = updated; setDoc(updated);
  }

  async function analyze(regenerate = false) {
    if (!doc || busy || analysisLock.current || courseLock.current) return;
    analysisLock.current = true;
    const id = doc.id; const target = page;
    setAnalysisKind("reader"); setAnalyzing(`${id}:${target}`); setError(""); setBatch(null);
    setPageJob({ id: `page:${id}:${target}:${Date.now()}`, label: doc.name, status: "running", completed: 0, total: 1, detail: `Analisi della pagina ${target}` });
    try {
      mergeSlide(id, target, await api<SlideData>(`/api/documents/${id}/analyze`, json("POST", { page: target, regenerate })), true);
      await refresh();
      setPageJob(previous => previous && { ...previous, status: "completed", completed: 1, detail: `Pagina ${target} pronta` });
    } catch (e) { setError((e as Error).message); setPageJob(previous => previous && { ...previous, status: "error", error: (e as Error).message }); }
    finally { analysisLock.current = false; setAnalyzing(null); }
  }

  async function analyzeAll() {
    if (!doc || busy || analysisLock.current || courseLock.current) return;
    const id = doc.id;
    analysisLock.current = true; stopBatch.current = false; setAnalysisKind("reader");
    setError("");
    setBatch({ id, startedAt: Date.now(), total: doc.pages, completed: analyzedCount, current: null, status: "running" });
    try {
      // Read the saved explanations again, including work completed in another tab.
      const saved = await api<StudyDocument>(`/api/documents/${id}`);
      let completed = Object.values(saved.slides).filter(s => s.explanation).length;
      for (const [target, slide] of Object.entries(saved.slides)) {
        if (slide.explanation) mergeSlide(id, Number(target), slide, true);
      }
      setBatch(previous => previous && { ...previous, completed });
      for (let target = 1; target <= saved.pages; target++) {
        if (stopBatch.current) break;
        if (saved.slides[target]?.explanation) continue;
        setBatch(previous => previous && { ...previous, current: target });
        setAnalyzing(`${id}:${target}`);
        const result = await api<SlideData>(`/api/documents/${id}/analyze`, json("POST", { page: target }));
        mergeSlide(id, target, result, true);
        completed++;
        setBatch(previous => previous && { ...previous, completed });
      }
      setBatch(previous => previous && { ...previous, current: null, status: completed === saved.pages ? "completed" : "stopped" });
    } catch (e) {
      setError(`Analisi interrotta: ${(e as Error).message} Le pagine già analizzate restano salvate. Puoi riprendere da quelle mancanti.`);
      setBatch(previous => previous && { ...previous, current: null, status: "error" });
    } finally {
      analysisLock.current = false; setAnalyzing(null);
      await refresh().catch(e => setError(e.message));
    }
  }

  function stopAnalysis() {
    stopBatch.current = true;
    setBatch(previous => previous && { ...previous, status: "stopping" });
  }

  async function closeDocument(fromRoute = false) {
    if (!fromRoute && busy) return;
    setBusy(true);
    try {
      flushNotes();
      await noteQueue.current;
      if (pendingNotes.current.size) throw new Error("Gli appunti non sono ancora salvati. Riprova prima di tornare alla biblioteca.");
      ++openSequence.current;
      const previousPdf = pdfRef.current;
      pdfRef.current = null; docRef.current = null;
      if (!restoringRoute.current) changeLocation(folderId);
      setDoc(null); setPdf(null); setSidebar(false); setSettings(false);
      void previousPdf?.destroy();
      await refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  return <SidebarProvider openMobile={sidebar} onOpenMobileChange={setSidebar}><div className={`app-shell ${doc ? "reader-active" : ""}`} onDragOver={e => { e.preventDefault(); if (folderId && !busy && !courseRunning && e.dataTransfer.types.includes("Files")) setDragging(true); }} onDrop={e => { e.preventDefault(); if (!folderId && e.dataTransfer.files.length) setError("Apri un esame prima di caricare un PDF."); }}>
    {folderId && <Input ref={input} type="file" accept="application/pdf,.pdf" multiple className="sr-only" onChange={e => void uploadFiles(e.target.files)} aria-label="Carica un PDF" />}
    {!doc && <Sidebar>
      <SidebarHeader><a className={`studio-brand ${homeStyles.brand}`} href="/" onClick={event => { event.preventDefault(); openFolder(""); }} aria-label="Studio, pagina iniziale"><span className={homeStyles.mascot} aria-hidden="true"><TonyMascot size={42} /></span><span>Studio</span></a><Button className="new-document" aria-label="Crea esame" onClick={() => { setSidebar(false); setCreatingFolder(true); }} disabled={busy}><Plus size={18} /> Crea esame</Button></SidebarHeader>
      <SidebarContent>
      <nav className="exam-folders" aria-label="Esami"><div className="section-label"><span>I tuoi esami</span><span>{folders.length}</span></div>
      <SidebarMenu>{folders.map(folder => <SidebarMenuItem key={folder.id}><SidebarMenuButton disabled={busy} isActive={folderId === folder.id} className={folderId === folder.id ? "folder-item active" : "folder-item"} data-exam-color={examColor(folder)} aria-current={folderId === folder.id ? "page" : undefined} onClick={() => { openFolder(folder.id); }}><span className="folder-icon"><FolderOpen size={19} strokeWidth={1.8} /></span><span className="folder-name">{folder.name}</span><small>{library.filter(d => d.folderId === folder.id).length}</small></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu>
      {!folders.length && <p className="exam-list-empty">Ogni esame ha il suo spazio.<br />Crea il primo per iniziare.</p>}
      </nav></SidebarContent>
      <SidebarFooter><SidebarProfile /></SidebarFooter>
    </Sidebar>}

    {islandJob && <AnalysisIsland key={islandJob.id} job={islandJob} onStop={courseRunning ? courseAnalysis.stopAnalysis : batchRunning ? stopAnalysis : undefined} />}
    <main className="main-shell">
      {!doc && <SidebarTrigger />}
      {error && <div className="error-banner" role="alert"><span>{error}</span><Button variant="ghost" aria-label="Chiudi messaggio" onClick={() => setError("")}><X size={16} /></Button></div>}

      {uploadProgress && <section className="upload-progress" role="status" aria-live="polite"><div><strong>{uploadProgress.completed < uploadProgress.total ? `Caricamento ${uploadProgress.completed + 1} di ${uploadProgress.total}` : `${uploadProgress.succeeded} PDF caricati`}</strong><span>{uploadProgress.completed < uploadProgress.total ? uploadProgress.name : uploadProgress.failures.length ? `${uploadProgress.failures.length} file non caricati` : "Materiali salvati nell’esame"}</span>{uploadProgress.completed === uploadProgress.total && <Button variant="ghost" size="icon" aria-label="Chiudi avanzamento caricamenti" onClick={() => setUploadProgress(null)}><X size={16} /></Button>}</div><progress value={uploadProgress.completed} max={uploadProgress.total} aria-label="PDF caricati" /></section>}
      {!doc && !folderId && <ExamOverview folders={folders} documents={library} onOpen={openFolder} onCreate={() => { setSidebar(false); setCreatingFolder(true); }} onUpdated={folder => setFolders(current => current.map(f => f.id === folder.id ? folder : f))} />}
      {folderId && <div className="welcome" hidden={!!doc}>
        <Button variant="ghost" className="exam-home-back" onClick={() => openFolder("")} disabled={busy}><ArrowLeft size={16} /> Tutti gli esami</Button>
        <CourseHeader folder={folders.find(f => f.id === folderId) || { id: folderId, name: "Esame", createdAt: "" }} />
        <div className="exam-action-grid">
        <CourseAnalysis key={folderId} folderId={folderId} documents={library.filter(d => d.folderId === folderId)} configured={configured} disabled={busy || !!analyzing || !!batchRunning} controller={courseAnalysis} />
        <section className="upload-zone upload-banner" aria-label="Aggiungi file" onDrop={e => { e.preventDefault(); setDragging(false); void uploadFiles(e.dataTransfer.files); }}><span className="upload-symbol"><Upload size={22} strokeWidth={1.5} /></span><div className="upload-banner-copy"><h2>Aggiungi file</h2><p>Trascina qui i tuoi PDF · Fino a 30 MB per file</p></div><Button variant="default" className="primary-button" disabled={busy} onClick={() => input.current?.click()}>{busy ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />}{busy ? "Caricamento in corso…" : "Scegli i PDF"}</Button></section>
        </div>
        <div className={`dashboard-columns ${folderId ? "" : "without-upload"}`}><section className="materials-card"><div className="card-heading"><div><h2>{folderId ? "Materiali dell’esame" : "I tuoi materiali"}</h2><p>Slide, spiegazioni e conversazioni. Tutto nello stesso posto.</p></div><span className="count-badge">{library.filter(d => !folderId || d.folderId === folderId).length}</span></div>
        {library.length > 4 && <label className="materials-search"><Search size={16} /><Input aria-label="Cerca un materiale" placeholder="Cerca nei materiali" value={query} onChange={e => setQuery(e.target.value)} /></label>}{library.some(d => !folderId || d.folderId === folderId) ? <MaterialList key={folderId} documents={library.filter(d => d.folderId === folderId)} folder={folders.find(f => f.id === folderId) || { id: folderId, name: "", createdAt: "" }} query={query} busy={busy} analysisRunning={courseRunning} onOpen={id => void openDocument(id)} onRenamed={updated => setLibrary(current => current.map(item => item.id === updated.id ? { ...item, name: updated.name, originalName: updated.originalName } : item))} onOrdered={updated => setFolders(current => current.map(f => f.id === updated.id ? updated : f))} /> : <div className="materials-empty"><span className="empty-document-icon"><FileText size={28} strokeWidth={1.5} /></span><h3>Il tuo prossimo passo inizia qui.</h3><p>{folderId ? "Carica le slide di questo esame per iniziare a studiare." : "Crea o apri un esame, poi aggiungi le tue slide."}</p>{!folderId && <Button variant="outline" className="secondary-button" onClick={() => { setSidebar(false); setCreatingFolder(true); }}><Plus size={16} /> Crea il primo esame</Button>}</div>}
        </section></div>

      </div>}
      {doc && <>

        <Button variant="ghost" size="icon" className="reader-back reader-floating-back" aria-label="Torna alla biblioteca" title="Torna ai materiali" disabled={busy} onClick={() => void closeDocument()}><ArrowLeft size={20} /></Button>
        <ReaderSplit><section className="slide-panel"><div className={`slide-stage ${activeSlide?.read ? "is-read" : ""}`} ref={viewer}>{pdf && <PdfCanvas pdf={pdf} page={page} zoom={zoom} fitHeight />}{busy && <div className="viewer-busy"><LoaderCircle className="spin" /> Apertura documento…</div>}</div><BottomPanel key={doc.id}><div className="slide-tools"><Button variant="outline" className="page-read-toggle" aria-pressed={!!activeSlide?.read} disabled={busy} onClick={toggleRead}><Check size={15} />{activeSlide?.read ? "Letta" : "Da leggere"}</Button><div className="page-navigation"><Button variant="ghost" className="icon-button" disabled={page <= 1 || busy} onClick={() => navigate(page - 1)} aria-label="Slide precedente"><ChevronLeft size={17} /></Button><label><Input aria-label="Numero della slide" type="number" min={1} max={doc.pages} value={page} onChange={e => { const n = Number(e.target.value); if (n >= 1 && n <= doc.pages) navigate(n); }} /> <span>/ {doc.pages}</span></label><Button variant="ghost" className="icon-button" disabled={page >= doc.pages || busy} onClick={() => navigate(page + 1)} aria-label="Slide successiva"><ChevronRight size={17} /></Button></div><div><Button variant="ghost" className="icon-button" onClick={() => setZoom(z => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))} disabled={zoom <= 0.5} aria-label="Riduci zoom"><Minus size={15} /></Button><Button variant="ghost" className="zoom-reset" onClick={() => setZoom(1)} title="Adatta alla larghezza">{Math.round(zoom * 100)}%</Button><Button variant="ghost" className="icon-button" onClick={() => setZoom(z => Math.min(2, Math.round((z + 0.1) * 10) / 10))} disabled={zoom >= 2} aria-label="Aumenta zoom"><Plus size={15} /></Button><span className="tool-divider" /><Button variant="ghost" className="icon-button" aria-label="Schermo intero" onClick={() => { void viewer.current?.requestFullscreen().catch(() => setError("Il browser non permette lo schermo intero.")); }}><Maximize2 size={15} /></Button></div></div>
          <div className="glossary"><div className="glossary-heading"><span><Languages size={17} /> Le parole della slide</span><span className="language-tag">EN <ArrowRight size={10} /> IT</span></div>{explanation?.glossary.length ? <div className="glossary-words">{explanation.glossary.map(g => <div key={g.word} className="glossary-word" title={g.context}><strong>{g.word}</strong><span>{g.translation}</span><small>{g.context}</small></div>)}</div> : <p>{explanation ? explanation.language === "en" ? "Nessun termine da tradurre individuato in questa slide." : "Questa slide non è in inglese. Puoi concentrarti sui concetti." : "Quando spieghi una slide in inglese, trovi qui i termini importanti con la traduzione italiana."}</p>}</div>
          <div className="keyboard-tip"><span>Il tuo ritmo, una slide alla volta.</span><span>Usa <kbd>←</kbd> <kbd>→</kbd> per sfogliare / <kbd>Spazio</kbd> letta / da leggere</span></div></BottomPanel>
        </section>
        <aside className="explanation-panel reader-chat-panel" style={{ "--reader-text-size": `${textSize}px` } as React.CSSProperties} aria-label="Tutor della slide"><h1 className="sr-only">{doc.name.replace(/\.pdf$/i, "")}</h1><StudyChat key={`${doc.id}:${page}`} id={doc.id} page={page} folder={doc.folderId} initial={activeSlide?.chat || []} explanation={explanation} onAnalyze={() => void analyze()} onAnalyzeAll={() => void analyzeAll()} analyzing={currentAnalyzing} batchRunning={!!batchRunning && batch?.id === doc.id} analysisBusy={courseRunning || !!analyzing || !!batchRunning} configured={configured} disabled={busy} analysisProgress={batch?.id === doc.id ? { completed: batch.completed, total: batch.total, current: batch.current, status: batch.status } : undefined} onStopAnalysis={stopAnalysis} onSettings={() => setSettings(true)} onSaved={messages => { if (docRef.current?.id === doc.id) mergeSlide(doc.id, page, { ...docRef.current.slides[page], notes: docRef.current.slides[page]?.notes || "", chat: messages }); }} />
        </aside></ReaderSplit>
      </>}
    </main>
    {dragging && <div className="drop-overlay" onDragLeave={e => { if (e.currentTarget === e.target) setDragging(false); }} onDrop={e => { e.preventDefault(); setDragging(false); void uploadFiles(e.dataTransfer.files); }}><Upload size={46} /><h2>Fai spazio a una nuova idea.</h2><p>Rilascia il PDF per iniziare.</p></div>}
    <NewExamDialog folders={folders} open={creatingFolder} onOpenChange={setCreatingFolder} onCreated={async folder => { setFolders(current => [...current.filter(f => f.id !== folder.id), folder]); openFolder(folder.id); await refresh(); }} />
    {settings && doc && <ReaderSettingsDialog zoom={zoom} onZoomChange={setZoom} textSize={textSize} onTextSizeChange={changeTextSize} configured={configured} name={doc.name} page={page} notes={activeSlide?.notes || ""} noteStatus={noteStatus} onNotesChange={saveNotes} hasExplanation={!!explanation} disabled={busy || courseRunning || !!analyzing || !!batchRunning} onRegenerate={() => { setSettings(false); void analyze(true); }} onResetZoom={() => setZoom(1)} onClose={() => { flushNotes(); setSettings(false); }} />}
  </div></SidebarProvider>;
}

function ReaderSettingsDialog({ zoom, onZoomChange, textSize, onTextSizeChange, configured, name, page, notes, noteStatus, onNotesChange, hasExplanation, disabled, onRegenerate, onResetZoom, onClose }: { zoom: number; onZoomChange: (value: number) => void; textSize: number; onTextSizeChange: (value: number) => void; configured: boolean; name: string; page: number; notes: string; noteStatus: string; onNotesChange: (notes: string) => void; hasExplanation: boolean; disabled: boolean; onRegenerate: () => void; onResetZoom: () => void; onClose: () => void }) {
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}><Dialog.Portal><Dialog.Overlay className="plan-overlay" /><Dialog.Content className="plan-dialog reader-settings-dialog"><Dialog.Close asChild><Button variant="ghost" size="icon" className="plan-dialog-close" aria-label="Chiudi impostazioni"><X size={18} /></Button></Dialog.Close><Dialog.Title>Impostazioni della lettura</Dialog.Title><Dialog.Description>{name.replace(/\.pdf$/i, "")} · Slide {page}</Dialog.Description><div className="reader-settings-content"><section className="settings-section"><h3>Visualizzazione</h3><p>Adatta lo spazio al tuo modo di studiare.</p><label>Zoom del PDF <strong>{Math.round(zoom * 100)}%</strong><input aria-label="Zoom del PDF" type="range" min="0.5" max="2" step="0.1" value={zoom} onChange={event => onZoomChange(Number(event.target.value))} /></label><label>Dimensione del testo <strong>{textSize} px</strong><input aria-label="Dimensione del testo" type="range" min="14" max="22" step="1" value={textSize} onChange={event => onTextSizeChange(Number(event.target.value))} /></label></section><section className="settings-section"><h3>Il tuo quaderno</h3><label>Appunti personali<Textarea aria-label={`Appunti della slide ${page}`} value={notes} onChange={event => onNotesChange(event.target.value)} maxLength={50000} placeholder="Collegamenti, formule e idee da ricordare…" /></label><p className="note-save"><Check size={13} />{noteStatus}</p></section><section className="settings-section"><h3>Strumenti</h3><Button variant="outline" onClick={onResetZoom}>Ripristina zoom</Button>{hasExplanation && <Button variant="outline" disabled={disabled || !configured} onClick={onRegenerate}><Sparkles size={15} />Rigenera analisi della pagina</Button>}{!configured && <p className="reader-settings-hint">Configura la chiave OpenAI sul server per generare analisi e risposte del tutor.</p>}<p className="reader-settings-hint">Scorri con le frecce. Premi Spazio per segnare la pagina letta o da leggere.</p></section></div></Dialog.Content></Dialog.Portal></Dialog.Root>;
}
