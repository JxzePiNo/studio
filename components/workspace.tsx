"use client";

import { UPLOAD_ACCEPT } from "@/lib/upload-formats";
import { useBackgroundUploads, UploadIsland, UploadNotifications } from "./background-uploads";
import { retryAnalysis } from "@/lib/analysis-retry";
import { documentPageOrder, runDocumentPages } from "@/lib/parallel-analysis";
import { cachedApi, cachedPdf, invalidateApiCache } from "@/lib/browser-data-cache";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { House, Clock3, Users, ArrowLeft, ArrowRight, FileText, FolderOpen, Languages, LoaderCircle, Plus, Search, Upload, X, Minimize } from "lucide-react";
import { authHeaders, firebaseEnabled } from "@/lib/firebase-client";
import { formatCourseName } from "@/lib/course-name";
import { examColor, examAccentColor } from "@/lib/exam-colors";
import { ShareDialog } from "./share-dialog";
import { SharedMaterials } from "./shared-materials";
import type { ShareTarget } from "@/lib/sharing-types";
import { FriendsSection } from "./friends-section";
import { FriendsActivity } from "./friends-activity";
import { MobileNavigation } from "./mobile-navigation";
import { SidebarProfile } from "./sidebar-profile";
import { StudySessionsView } from "./study-sessions-view";
import { ExamOverview } from "./exam-overview";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { CourseHeader } from "./course-header";
import { CourseAnalysis } from "./course-analysis";
import { useCourseAnalysis } from "./use-course-analysis";
import { GeneratedMaterials } from "./generated-materials";
import { NotificationCenter } from "./notification-center";
import { AnalysisIsland, type AnalysisIslandJob } from "./analysis-island";
import { useBackgroundChat, ChatNotifications } from "./background-chat";
import { StudySessionBar, useStudySession } from "./study-session";
import sessionStyles from "./study-session.module.css";
import { useAmbientParallax } from "./use-ambient-parallax";
import { CourseAmbient } from "./course-ambient";
import { TonyCompanion } from "./tony-companion";
import homeStyles from "./home-greeting.module.css";
import { mergeAnalysisSlide } from "@/lib/merge-analysis-slide";
import { NewExamDialog } from "./new-exam-dialog";
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarTrigger } from "./ui/sidebar";
import { CourseContextMenu, type CourseAction } from "./course-context-menu";
import { MaterialList } from "./material-list";
import { StudyChat } from "./study-chat";
import type { ExamFolder } from "@/lib/types";
import { loadPdf, PdfCanvas } from "./pdf-viewer";
import { useReaderPageScroll } from "./use-reader-page-scroll";
import { ReaderSettingsDialog } from "./reader-settings-dialog";
import { ReaderToolbar } from "./reader-toolbar";
import { BottomPanel } from "./bottom-panel";
import { BaristaLoading } from "./barista-loading";
import { ChatLoadingSkeleton } from "./chat-loading-skeleton";
import { ReaderSplit } from "./reader-split";
import type { DocumentSummary, SlideData, StudyDocument } from "@/lib/types";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = { ...init?.headers, ...await authHeaders(), ...(init?.method === "PATCH" && /^\/api\/documents\/[^/]+$/.test(url) ? { Prefer: "return=minimal" } : {}) };
  return cachedApi<T>(url, { ...init, headers });
}
const json = (method: string, data: unknown) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
const size = (bytes: number) => bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
function resetMobilePageScroll() {
  if (!window.matchMedia("(max-width: 700px)").matches) return;
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
}
type BatchProgress = { id: string; startedAt: number; total: number; completed: number; current: number | null; active: number[]; status: "running" | "stopping" | "stopped" | "completed" | "error" };

export default function Workspace() {
  const [friendsTab, setFriendsTab] = useState("friends");
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);
  const [section, setSection] = useState<"study" | "exams" | "sessions" | "friends">("study");
  const [selectedStudyDay, setSelectedStudyDay] = useState("");
  const [folders, setFolders] = useState<ExamFolder[]>([]);
  const [folderId, setFolderId] = useState("");
  const themeFolder = section === "study" ? folders.find(folder => folder.id === folderId) : undefined;
  const courseColor = themeFolder ? examAccentColor(themeFolder) : undefined;
  const courseForeground = themeFolder && ["mint", "peach"].includes(examColor(themeFolder)) ? "#172033" : "#ffffff";
  const [requestedCourseAction, setRequestedCourseAction] = useState<{ folderId: string; action: Exclude<CourseAction, "open">; requestId: number }>();
  const [quizToOpen, setQuizToOpen] = useState<{ documentId: string; quizId: string } | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [library, setLibrary] = useState<DocumentSummary[]>([]);
  const [doc, setDoc] = useState<StudyDocument | null>(null);
  const [readerClean, setReaderClean] = useState(false);
  const [pdfOnly, setPdfOnly] = useState(false);
  useEffect(() => { setReaderClean(false); setPdfOnly(false); }, [doc?.id]);
  const [opening, setOpening] = useState<{ id: string; name: string; error?: string } | null>(null);
  useLayoutEffect(() => {
    const media = window.matchMedia("(max-width: 700px)");
    const previous = history.scrollRestoration;
    const update = () => { history.scrollRestoration = media.matches ? "manual" : previous; };
    update(); media.addEventListener("change", update);
    return () => { history.scrollRestoration = previous; media.removeEventListener("change", update); };
  }, []);
  useLayoutEffect(() => {
    resetMobilePageScroll();
  }, [section, folderId, friendsTab, selectedStudyDay, doc?.id, opening?.id]);
  const openingRequest = useRef<AbortController | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const studySession = useStudySession({ documents: library, reader: doc && pdf ? { id: doc.id, name: doc.name, page } : undefined });
  const historyPending = useRef(false);
  historyPending.current = studySession.savingHistory;
  const [mapReturn, setMapReturn] = useState<{ documentId: string; page: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [fitWidth, setFitWidth] = useState(false);
  const [autoFit, setAutoFit] = useState(true);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("studio-reader-zoom") || "null");
      if (saved && typeof saved.zoom === "number" && saved.zoom >= 0.5 && saved.zoom <= 2 && typeof saved.fitWidth === "boolean") {
        setZoom(saved.zoom); setFitWidth(saved.fitWidth); setAutoFit(saved.autoFit !== false);
      }
    } catch {}
  }, []);
  function changeZoom(value: number, width = fitWidth) {
    setZoom(value); setFitWidth(width);
    try { localStorage.setItem("studio-reader-zoom", JSON.stringify({ zoom: value, fitWidth: width, autoFit })); } catch {}
  }
  const [portrait, setPortrait] = useState(false);
  const [textSize, setTextSize] = useState(14);
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
  const [sidebarTonySlot, setSidebarTonySlot] = useState<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState(false);
  const [noteStatus, setNoteStatus] = useState("Salvato in locale");
  const uploads = useBackgroundUploads(document => setLibrary(items => [{ ...document, analyzedPages: 0, readPages: 0 }, ...items.filter(item => item.id !== document.id)]));
  const uploadLock = uploads.pending;
  const input = useRef<HTMLInputElement>(null);
  const docRef = useRef<StudyDocument | null>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const openSequence = useRef(0);
  const noteQueue = useRef<Promise<unknown>>(Promise.resolve());
  const noteVersion = useRef(0);
  const readVersions = useRef(new Map<string, number>());
  const pendingNotes = useRef(new Map<string, { id: string; page: number; notes: string; version: number }>());
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingWrites = useRef(0);
  const analysisLock = useRef(false);
  const courseLock = useRef(false);
  const readerJobDocument = useRef<string | null>(null);
  const stopBatch = useRef(false);
  const viewer = useRef<HTMLDivElement>(null);
  const chatController = useBackgroundChat({ onQuizStarted: id => { if (docRef.current?.id === id) void closeDocument(); }, onSaved: (id, target, messages) => {
    if (messages.some(message => message.quiz)) window.dispatchEvent(new CustomEvent("studio-quizzes-changed", { detail: { documentId: id } }));
    if (docRef.current?.id !== id) return;
    mergeSlide(id, target, { ...docRef.current.slides[target], notes: docRef.current.slides[target]?.notes || "", chat: messages });
  } });
  const chatPending = useRef(false);
  chatPending.current = chatController.pending;
  const activeSlide = doc?.slides[page];
  const explanation = activeSlide?.explanation;
  const currentAnalyzing = analyzing === `${doc?.id}:${page}`;
  const batchRunning = batch?.status === "running" || batch?.status === "stopping";
  const analyzedCount = doc ? Object.values(doc.slides).filter(s => s.explanation).length : 0;

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
      if (pendingNotes.current.size || pendingWrites.current || analysisLock.current || courseLock.current || uploadLock.current || chatPending.current || historyPending.current) {
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
  useEffect(() => {
    const share = (event: Event) => setShareTarget((event as CustomEvent<ShareTarget>).detail);
    const open = (event: Event) => { const id = (event as CustomEvent<{ folderId: string }>).detail.folderId; void refresh().then(() => openFolder(id)).catch(cause => setError(cause.message)); };
    const changed = () => { void refresh().catch(cause => setError(cause.message)); };
    window.addEventListener("studio-share", share);
    window.addEventListener("studio-open-shared-course", open);
    window.addEventListener("studio-sharing-changed", changed);
    return () => { window.removeEventListener("studio-share", share); window.removeEventListener("studio-open-shared-course", open); window.removeEventListener("studio-sharing-changed", changed); };
  }, [refresh]);
  useEffect(() => {
    if (!folders.find(folder => folder.id === folderId)?.collaborative) return;
    let pending = false;
    const controller = new AbortController();
    const update = async () => {
      if (pending || document.visibilityState !== "visible" || pendingNotes.current.size || pendingWrites.current || chatPending.current || analysisLock.current) return;
      pending = true;
      try {
        const current = docRef.current;
        await invalidateApiCache("/api/folders", "/api/documents", ...(current ? [`/api/documents/${current.id}`, `/api/documents/${current.id}/quiz`] : []));
        await refresh();
        if (current) {
          const incoming = await api<StudyDocument>(`/api/documents/${current.id}`, { signal: controller.signal });
          if (!controller.signal.aborted && docRef.current?.id === current.id && !pendingNotes.current.size && !pendingWrites.current && !chatPending.current && !analysisLock.current) {
            const updated = { ...incoming, currentPage: docRef.current.currentPage };
            docRef.current = updated; setDoc(updated);
            chatController.registerDocumentMaterials(updated);
            chatController.receiveMessages(updated.id, updated.currentPage, updated.slides[updated.currentPage]?.chat || []);
            window.dispatchEvent(new CustomEvent("studio-quizzes-changed", { detail: { documentId: current.id } }));
          }
        }
      } catch (cause) { if (!controller.signal.aborted) setError((cause as Error).message); }
      finally { pending = false; }
    };
    const timer = setInterval(() => { void update(); }, 10000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [folderId, folders.find(folder => folder.id === folderId)?.collaborative, refresh]);
  const courseAnalysis = useCourseAnalysis({
    folderId, documents: library, configured, disabled: busy,
    canStart: ids => (!analysisLock.current || !ids.includes(readerJobDocument.current || "")),
    onProgressSaved: async () => { await invalidateApiCache("/api/documents"); await refresh(); },
    onSlideSaved: (id, target, result) => {
      mergeSlide(id, target, result, true);
      setLibrary(items => items.map(item => item.id === id ? { ...item, analyzedPages: Math.min(item.pages, item.analyzedPages + 1) } : item));
      void invalidateApiCache(`/api/documents/${id}`, `/api/documents/${id}/quiz`);
    },
  });
  const courseRunning = courseAnalysis.anyRunning;
  courseLock.current = courseRunning;
  const courseJobs: AnalysisIslandJob[] = courseAnalysis.jobs.filter(progress => folders.some(folder => folder.id === progress.folderId)).map(progress => ({
    id: `course:${progress.folderId}:${progress.startedAt}`,
    label: formatCourseName(folders.find(folder => folder.id === progress.folderId)?.name || "Esame"),
    status: progress.status, completed: progress.completed, total: progress.total,
    detail: progress.active.length ? `${new Set(progress.active.map(item => item.id)).size} file / ${progress.active.length} pagine in analisi` : undefined,
    error: progress.error,
    onStop: () => courseAnalysis.stopAnalysis(progress.folderId),
  }));
  const readerJob: AnalysisIslandJob | null = batch ? {
    id: `reader:${batch.id}:${batch.startedAt}`, label: library.find(file => file.id === batch.id)?.name || "PDF",
    status: batch.status, completed: batch.completed, total: batch.total,
    detail: batch.active.length ? `Pagine ${batch.active.join(", ")} / ${batch.total}` : undefined,
    onStop: stopAnalysis,
  } : pageJob;
  const islandJobs = [...courseJobs, ...(readerJob ? [readerJob] : [])];
  const selectedDocumentAnalyzing = !!doc && courseAnalysis.isDocumentRunning(doc.id);
  const selectedCourseReaderBusy = !!(analyzing || batchRunning) && library.some(file => file.folderId === folderId && file.id === readerJobDocument.current);
  const selectedCourseDocuments = library.filter(file => file.folderId === folderId);
  const selectedCourseComplete = selectedCourseDocuments.length > 0 && selectedCourseDocuments.every(file => file.pages > 0 && file.analyzedPages >= file.pages);
  const showCourseAnalysis = !selectedCourseComplete || selectedCourseReaderBusy || courseAnalysis.jobs.some(job => job.folderId === folderId && ["checking", "running", "stopping"].includes(job.status));

  useEffect(() => {
    void refresh().catch(e => setError(e.message));
    void api<{ configured: boolean }>("/api/status").then(s => setConfigured(s.configured)).catch(e => setError(e.message));
    return () => { openingRequest.current?.abort(); void pdfRef.current?.destroy(); };
  }, [refresh]);

  useEffect(() => {
    const logout = () => {
      void (async () => {
        if (uploadLock.current) { setError("Attendi il completamento dei caricamenti prima di uscire."); return; }
        if (analysisLock.current || courseLock.current || chatPending.current || historyPending.current) { setError("Attendi la fine dell’analisi prima di uscire."); return; }
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
    if (busy) return;
    resetMobilePageScroll();
    setSection("study"); setSelectedStudyDay(""); changeLocation(id); setFolderId(id); setQuery(""); setSidebar(false);
  }
  function openExams() {
    if (busy) return;
    resetMobilePageScroll();
    if (window.location.pathname !== "/esami" || window.location.search) window.history.pushState(null, "", "/esami");
    setSection("exams"); setSelectedStudyDay(""); setFolderId(""); setQuery(""); setSidebar(false);
  }
  function openSessions(day = "") {
    if (busy) return;
    resetMobilePageScroll();
    const path = `/sessioni${day ? `?giorno=${encodeURIComponent(day)}` : ""}`;
    if (`${window.location.pathname}${window.location.search}` !== path) window.history.pushState(null, "", path);
    setSection("sessions"); setSelectedStudyDay(day); setFolderId(""); setSidebar(false);
    void studySession.reloadHistory();
  }
  function openFriends() {
    if (busy) return;
    resetMobilePageScroll();
    if (docRef.current) { void closeDocument().then(() => openFriends()); return; }
    if (window.location.pathname !== "/amici" || window.location.search) window.history.pushState(null, "", "/amici");
    setFriendsTab("friends"); setSection("friends"); setFolderId(""); setSidebar(false);
  }
  const restoreRoute = useRef<(path: string) => Promise<void>>(async () => {});
  const restoringRoute = useRef(false);
  useEffect(() => {
    const restore = () => {
      const path = window.location.pathname + window.location.search;
      void restoreRoute.current(path).catch(e => setError((e as Error).message));
    };
    restore(); window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  restoreRoute.current = async (path) => {
    const parsedRoute = new URL(path, window.location.origin);
    const sessionsRoute = parsedRoute.pathname === "/sessioni";
    const match = parsedRoute.pathname.match(/^\/esami\/([^/]+)(?:\/documenti\/([^/]+))?\/?$/);
    restoringRoute.current = true;
    try {
      setSection(["/amici", "/inviti"].includes(parsedRoute.pathname) ? "friends" : sessionsRoute ? "sessions" : parsedRoute.pathname === "/esami" ? "exams" : "study");
      setFriendsTab(parsedRoute.pathname === "/inviti" || parsedRoute.searchParams.get("tab") === "inviti" ? "invites" : "friends");
      if (parsedRoute.pathname === "/inviti") window.history.replaceState(null, "", "/amici?tab=inviti");
      setSelectedStudyDay(sessionsRoute ? parsedRoute.searchParams.get("giorno") || "" : "");
      if (match?.[2]) await openDocument(match[2]);
      else { if (docRef.current || openingRequest.current || opening) await closeDocument(true); if (!docRef.current) setFolderId(match?.[1] || ""); }
    } finally { restoringRoute.current = false; }
  };

  async function openDocument(id: string) {
    setPortrait(false);
    const sequence = ++openSequence.current;
    openingRequest.current?.abort();
    const controller = new AbortController();
    openingRequest.current = controller;
    const summary = library.find(item => item.id === id);
    const targetFolder = summary?.folderId || window.location.pathname.match(/^\/esami\/([^/]+)/)?.[1] || folderId;
    const updateHistory = !restoringRoute.current;
    flushNotes();
    setSection("study");
    setOpening({ id, name: summary?.name || "Il tuo PDF" });
    setBusy(true); setError(""); setSidebar(false); setSettings(false);
    const previousPdf = pdfRef.current;
    pdfRef.current = null; docRef.current = null; setDoc(null); setPdf(null);
    void previousPdf?.destroy();
    setFolderId(targetFolder);
    if (updateHistory) changeLocation(targetFolder, id);
    try {
      await noteQueue.current;
      controller.signal.throwIfAborted();
      if (pendingNotes.current.size) throw new Error("Gli appunti non sono ancora salvati. Riprova prima di cambiare documento.");
      const result = await api<StudyDocument>(`/api/documents/${id}`, { signal: controller.signal });
      if (sequence !== openSequence.current) return;
      setOpening({ id, name: result.name });
      chatController.registerDocumentMaterials(result);
      const bytes = await cachedPdf(`/api/documents/${id}/pdf`, await authHeaders(), controller.signal);
      const loaded = await loadPdf(bytes, undefined, controller.signal);
      if (sequence !== openSequence.current) { await loaded.destroy(); return; }
      pdfRef.current = loaded;
      if (updateHistory) changeLocation(result.folderId || targetFolder, id);
      docRef.current = result; setDoc(result); setOpening(null); setFolderId(result.folderId || ""); setPdf(loaded); setPage(result.currentPage);
      setNoteStatus(firebaseEnabled ? "Salvato su Firebase" : "Salvato in locale");
    } catch (e) {
      if (sequence === openSequence.current && !controller.signal.aborted) setOpening(current => current && { ...current, error: (e as Error).message });
    } finally {
      if (sequence === openSequence.current) setBusy(false);
      if (openingRequest.current === controller) openingRequest.current = null;
    }
  }

  function uploadFiles(selection: FileList | File[] | null) {
    const files = Array.from(selection || []);
    if (!files.length || busy) return;
    const folder = folders.find(item => item.id === folderId);
    if (!folder) { setError("Apri un esame prima di caricare i file."); return; }
    uploads.enqueue(files, folder.id, formatCourseName(folder.name));
    if (input.current) input.current.value = "";
  }

  const ambientRef = useAmbientParallax(!doc && !opening);

  const navigate = useCallback((target: number) => {
    const current = docRef.current;
    if (busy || !current || target < 1 || target > current.pages) return;
    setPage(target);
    current.currentPage = target;
    flushNotes();
    queueWrite(async () => {
      try { await api(`/api/documents/${current.id}`, json("PATCH", { page: target })); }
      catch (e) { setError((e as Error).message); }
    });
  }, [busy, flushNotes, queueWrite]);
  useReaderPageScroll(viewer, doc?.id, page, doc?.pages || 0, navigate, busy || !!opening);

  const toggleRead = useCallback(() => {
    const current = docRef.current;
    if (!current || busy) return;
    const target = page;
    const read = !current.slides[target]?.read;
    const previousToday = studySession.hasReadToday(current.id, target);
    const readKey = `${current.id}:${target}`;
    const version = (readVersions.current.get(readKey) || 0) + 1;
    readVersions.current.set(readKey, version);
    studySession.recordRead(current.id, target, read);
    const updated = { ...current, slides: { ...current.slides, [target]: { ...current.slides[target], notes: current.slides[target]?.notes || "", read } } };
    docRef.current = updated; setDoc(updated);
    queueWrite(async () => {
      try { await api(`/api/documents/${current.id}`, json("PATCH", { page: target, read })); studySession.commitRead(current.id, target, read);
        const readPages = Object.values<SlideData>(docRef.current?.id === current.id ? docRef.current.slides : updated.slides).filter(slide => slide.read).length;
        setLibrary(items => items.map(item => item.id === current.id ? { ...item, readPages } : item)); }
      catch (e) {
        if (readVersions.current.get(readKey) === version) studySession.recordRead(current.id, target, previousToday);
        if (readVersions.current.get(readKey) === version && docRef.current?.id === current.id && docRef.current.slides[target]?.read === read) {
          const rollback = { ...docRef.current, slides: { ...docRef.current.slides, [target]: { ...docRef.current.slides[target], read: !read } } };
          docRef.current = rollback; setDoc(rollback);
        }
        setError((e as Error).message);
      }
    });
  }, [busy, page, queueWrite, refresh, studySession.recordRead, studySession.hasReadToday, studySession.commitRead]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest("input, textarea, button, a, select, [contenteditable], [role=dialog], [role=menu], [role=separator]")) return;
      if (settings || event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
      if (event.code === "Space" && docRef.current) {
        event.preventDefault();
        const markingRead = !docRef.current.slides[page]?.read;
        toggleRead();
        if (markingRead) navigate(page + 1);
      }
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
    if (!doc || busy || analysisLock.current || courseAnalysis.isDocumentRunning(doc.id)) return;
    analysisLock.current = true;
    const id = doc.id; const target = page; readerJobDocument.current = id;
    setAnalyzing(`${id}:${target}`); setError(""); setBatch(null);
    setPageJob({ id: `page:${id}:${target}:${Date.now()}`, label: doc.name, status: "running", completed: 0, total: 1, detail: `Analisi della pagina ${target}` });
    try {
      mergeSlide(id, target, await retryAnalysis(() => api<SlideData>(`/api/documents/${id}/analyze`, json("POST", { page: target, regenerate }))), true);
      await refresh();
      setPageJob(previous => previous && { ...previous, status: "completed", completed: 1, detail: `Pagina ${target} pronta` });
    } catch (e) { setError((e as Error).message); setPageJob(previous => previous && { ...previous, status: "error", error: (e as Error).message }); }
    finally { analysisLock.current = false; readerJobDocument.current = null; setAnalyzing(null); }
  }

  async function analyzeAll() {
    if (!doc || busy || analysisLock.current || courseAnalysis.isDocumentRunning(doc.id)) return;
    const id = doc.id;
    analysisLock.current = true; readerJobDocument.current = id; stopBatch.current = false;
    setError("");
    setBatch({ id, startedAt: Date.now(), total: doc.pages, completed: analyzedCount, current: null, active: [], status: "running" });
    try {
      // Read the saved explanations again, including work completed in another tab.
      const saved = await api<StudyDocument>(`/api/documents/${id}`);
      let completed = Object.values(saved.slides).filter(s => s.explanation).length;
      for (const [target, slide] of Object.entries(saved.slides)) {
        if (slide.explanation) mergeSlide(id, Number(target), slide, true);
      }
      setBatch(previous => previous && { ...previous, completed });
      const active = new Set<number>();
      const pending = documentPageOrder(saved.pages).filter(target => !saved.slides[target]?.explanation);
      const updateActive = () => setBatch(previous => previous && { ...previous, current: [...active][0] ?? null, active: [...active] });
      await runDocumentPages(pending, async target => {
        active.add(target); updateActive();
        try {
          const result = await retryAnalysis(() => api<SlideData>(`/api/documents/${id}/analyze`, json("POST", { page: target })));
          if (!result.explanation) throw new Error("La pagina non ha restituito una spiegazione valida. Riprova.");
          mergeSlide(id, target, result, true);
          completed++;
          setBatch(previous => previous && { ...previous, completed });
        } finally { active.delete(target); updateActive(); }
      }, () => stopBatch.current, saved.pages);
      setBatch(previous => previous && { ...previous, current: null, status: completed === saved.pages ? "completed" : "stopped" });
    } catch (e) {
      setError(`Analisi interrotta: ${(e as Error).message} Le pagine già analizzate restano salvate. Puoi riprendere da quelle mancanti.`);
      setBatch(previous => previous && { ...previous, current: null, status: "error" });
    } finally {
      analysisLock.current = false; readerJobDocument.current = null; setAnalyzing(null);
      await refresh().catch(e => setError(e.message));
    }
  }

  function stopAnalysis() {
    stopBatch.current = true;
    setBatch(previous => previous && { ...previous, status: "stopping" });
  }

  async function closeDocument(fromRoute = false) {
    if (!fromRoute && busy && !opening) return;
    // Workspace owns the save queue, so leaving the reader does not interrupt it.
    flushNotes();
    const saves = noteQueue.current;
    const current = docRef.current;
    if (current) setLibrary(items => items.map(item => item.id === current.id ? {
      ...item,
      analyzedPages: Object.values(current.slides).filter(slide => slide.explanation).length,
      readPages: Object.values(current.slides).filter(slide => slide.read).length,
    } : item));
    ++openSequence.current;
    openingRequest.current?.abort(); openingRequest.current = null; setOpening(null);
    const previousPdf = pdfRef.current;
    pdfRef.current = null; docRef.current = null;
    if (!restoringRoute.current) changeLocation(folderId);
    setDoc(null); setPdf(null); setSidebar(false); setSettings(false); setBusy(false);
    void previousPdf?.destroy();
    void saves.catch(e => setError((e as Error).message));
  }

  const studyDock = (<div className={`${sessionStyles.dock} study-activity-dock`}>
      <StudySessionBar suppressed={readerClean && !!doc} portrait={!!doc && portrait} session={studySession} document={doc ? { name: doc.name, read: Object.values(doc.slides).filter(slide => slide.read).length, total: doc.pages } : undefined} />
      <FriendsActivity running={studySession.running} onOpen={openFriends} />
      <NotificationCenter events={[...islandJobs.map(job => `analysis:${job.id}:${job.status}`), ...chatController.notifications.map(item => `chat:${item.key}`), ...uploads.jobs.map(job => `upload:${job.id}:${job.status}`)]}>{hideNotifications => <>
      {islandJobs.length > 0 && <AnalysisIsland jobs={islandJobs} embedded onHide={hideNotifications} />}
      <UploadNotifications controller={uploads} onOpen={id => { hideNotifications(); void openDocument(id); }} />
      <ChatNotifications controller={chatController} onHide={hideNotifications} onOpenQuiz={(id, quizId) => { hideNotifications(); const course = library.find(item => item.id === id)?.folderId; if (!course) return; if (docRef.current || opening) void closeDocument(); setSection("study"); setFolderId(course); setQuery(""); changeLocation(course); if (quizId) setQuizToOpen({ documentId: id, quizId }); }} onOpen={(id, target) => { hideNotifications(); void (async () => {
        if (docRef.current?.id !== id) await openDocument(id);
        if (docRef.current?.id === id) navigate(Math.min(Math.max(1, target), docRef.current.pages));
      })(); }} />
      </>}</NotificationCenter>
      <GeneratedMaterials items={chatController.generations.filter(item => item.documentId === doc?.id || library.some(file => file.id === item.documentId))} onSaved={chatController.receiveMessages} onNavigatePage={async (item, target) => { if (docRef.current?.id !== item.documentId) await openDocument(item.documentId); if (docRef.current?.id === item.documentId) { setMapReturn({ documentId: item.documentId, page: item.page }); navigate(target); } }} />
    </div>);

  return <SidebarProvider openMobile={sidebar} onOpenMobileChange={setSidebar}><div className={`app-shell ${doc || opening ? "reader-active" : ""} ${readerClean && doc ? "reader-clean" : ""} ${pdfOnly && doc ? "reader-pdf-only" : ""}`} onDragOver={e => { e.preventDefault(); if (folderId && !busy && e.dataTransfer.types.includes("Files")) setDragging(true); }} onDrop={e => { e.preventDefault(); if (!folderId && e.dataTransfer.files.length) setError("Apri un esame prima di caricare un file."); }}>
    {folderId && <Input ref={input} type="file" accept={UPLOAD_ACCEPT} multiple className="sr-only" onChange={e => void uploadFiles(e.target.files)} aria-label="Carica PDF o immagini" />}
    {!doc && !opening && <Sidebar>
      <SidebarHeader><a className="studio-brand" href="/" onClick={event => { event.preventDefault(); openFolder(""); }} aria-label="Studio, pagina iniziale">studio<span>.</span></a></SidebarHeader>
      <SidebarContent>
      <nav className="sidebar-study-nav" aria-label="Studio"><SidebarMenu><SidebarMenuItem><SidebarMenuButton className="sidebar-session-link" isActive={section === "study" && !folderId} aria-current={section === "study" && !folderId ? "page" : undefined} onClick={() => openFolder("")} disabled={busy}><House size={18} /><span>Home</span></SidebarMenuButton></SidebarMenuItem><SidebarMenuItem><SidebarMenuButton className="sidebar-session-link" isActive={section === "sessions"} aria-current={section === "sessions" ? "page" : undefined} onClick={() => openSessions()} disabled={busy}><Clock3 size={18} /><span>Sessioni di studio</span></SidebarMenuButton></SidebarMenuItem><SidebarMenuItem><SidebarMenuButton className="sidebar-session-link" isActive={section === "friends"} aria-current={section === "friends" ? "page" : undefined} onClick={openFriends} disabled={busy}><Users size={18} /><span>Amici</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu></nav>
      <div className="sidebar-create-exam"><Button className="new-document" aria-label="Crea esame" onClick={() => { setSidebar(false); setCreatingFolder(true); }} disabled={busy}><Plus size={18} /> Crea esame</Button></div>
      <nav className="exam-folders" aria-label="Esami"><div className="section-label"><button type="button" className="sidebar-exams-home" aria-current={section === "exams" ? "page" : undefined} disabled={busy} onClick={openExams}><span>I tuoi esami</span><span>{folders.filter(folder => !folder.archived).length}</span></button></div>
      <SidebarMenu>{folders.filter(folder => !folder.archived).map(folder => <SidebarMenuItem key={folder.id}><CourseContextMenu folder={folder} disabled={busy} onAction={action => { if (action === "open") openFolder(folder.id); else { openFolder(""); setRequestedCourseAction({ folderId: folder.id, action, requestId: Date.now() }); } }}><SidebarMenuButton disabled={busy} isActive={folderId === folder.id} className={folderId === folder.id ? "folder-item active" : "folder-item"} data-exam-color={examColor(folder)} style={{ "--course-accent": examAccentColor(folder) } as React.CSSProperties} aria-current={folderId === folder.id ? "page" : undefined} onClick={() => { openFolder(folder.id); }}><span className="folder-icon"><FolderOpen size={19} strokeWidth={1.8} /></span><span className="folder-name">{formatCourseName(folder.name)}</span><small>{library.filter(d => d.folderId === folder.id).length}</small></SidebarMenuButton></CourseContextMenu></SidebarMenuItem>)}</SidebarMenu>
      {!folders.some(folder => !folder.archived) && <p className="exam-list-empty">Ogni esame ha il suo spazio.<br />Crea il primo per iniziare.</p>}
      </nav><div ref={setSidebarTonySlot} className="sidebar-tony-slot" /></SidebarContent>
      <SidebarFooter><SidebarProfile /></SidebarFooter>
    </Sidebar>}

    <UploadIsland controller={uploads} summaryHidden={studySession.hidden} />
    <main ref={ambientRef} className="main-shell" data-section={section} data-course-theme={courseColor ? "true" : undefined} style={courseColor ? { "--course-color": courseColor, "--course-foreground": courseForeground } as React.CSSProperties : undefined}>
      {courseColor && !doc && !opening && <CourseAmbient />}
      {doc && <header className="reader-topbar">
        <Button variant="ghost" className="workspace-back" aria-label="Torna alla biblioteca" onClick={() => void closeDocument()}><ArrowLeft size={16} /><span>Torna al corso</span></Button>
        <ReaderToolbar name={doc.name} page={page} total={doc.pages} zoom={zoom} autoFit={autoFit} portrait={portrait} pdfOnly={pdfOnly} disabled={busy} onZoom={changeZoom} onAutoFit={() => { setAutoFit(true); setZoom(1); try { localStorage.setItem("studio-reader-zoom", JSON.stringify({ zoom: 1, fitWidth, autoFit: true })); } catch {} }} onNavigate={navigate} onPdfOnly={() => setPdfOnly(value => !value)} onComplete={() => { if (!docRef.current?.slides[page]?.read) toggleRead(); navigate(page + 1); }} onClean={() => { setPdfOnly(false); setReaderClean(true); }} onSettings={() => setSettings(true)} />
        {studyDock}
      </header>}

      {!doc && <header className="workspace-topbar">
        {(folderId || section !== "study" || opening) && <Button variant="ghost" className="workspace-back" aria-label={doc || opening ? "Torna alla biblioteca" : "Torna alla home"} onClick={() => { if (doc || opening) void closeDocument(); else openFolder(""); }}><ArrowLeft size={16} /><span>{doc || opening ? "Torna al corso" : "Torna alla home"}</span></Button>}
        {studyDock}
        {!opening && <SidebarTrigger />}
      </header>}
      <TonyCompanion sidebarSlot={sidebarTonySlot} context={doc || opening ? "reader" : section === "sessions" ? "sessions" : folderId ? "course" : "home"} onNavigate={destination => {
        if (busy || doc || opening) return false;
        if (destination === "sessions") openSessions();
        else if (destination === "course") { const id = folderId || folders.find(folder => !folder.archived)?.id; if (!id) return false; openFolder(id); }
        else openFolder("");
        setSidebar(false);
        return true;
      }} />
      {error && <div className="error-banner" role="alert"><span>{error}</span><Button variant="ghost" aria-label="Chiudi messaggio" onClick={() => setError("")}><X size={16} /></Button></div>}


      {(section === "study" || section === "exams") && !doc && !opening && <ExamOverview examsOnly={section === "exams"} dialogOnly={!!folderId} requestedCourseAction={requestedCourseAction} onCourseActionHandled={() => setRequestedCourseAction(undefined)} onDeleted={id => { setFolders(items => items.filter(item => item.id !== id)); setLibrary(items => items.filter(item => item.folderId !== id)); if (folderId === id) openFolder(""); void refresh(); }} isCourseBusy={id => uploads.jobs.some(job => job.folderId === id && ["queued", "preparing", "uploading", "processing"].includes(job.status)) || pendingWrites.current > 0 || courseAnalysis.jobs.some(job => job.folderId === id && ["checking", "running", "stopping"].includes(job.status)) || (!!readerJobDocument.current && analysisLock.current && library.some(item => item.id === readerJobDocument.current && item.folderId === id)) || Object.entries(chatController.sessions).some(([key, value]) => value.status === "pending" && library.some(item => item.folderId === id && key.startsWith(`${item.id}:`)))} onActivityDaySelect={openSessions} activity={studySession.activity} today={studySession.todayDate} folders={folders} documents={library} onOpen={openFolder} onCreate={() => { setSidebar(false); setCreatingFolder(true); }} onUpdated={folder => { setFolders(current => current.map(f => f.id === folder.id ? folder : f)); if (folder.archived && folderId === folder.id) openFolder(""); }} />}
      {section === "study" && !folderId && !doc && !opening && <SharedMaterials home />}
      {section === "friends" && !doc && !opening && <FriendsSection initialTab={friendsTab} onTabChange={setFriendsTab} />}
      {section === "sessions" && !doc && !opening && <StudySessionsView sessions={studySession.sessions} activity={studySession.activity} today={studySession.todayDate} loading={studySession.loadingHistory} error={studySession.errorHistory} onRetry={() => void studySession.reloadHistory()} selectedDay={selectedStudyDay || null} onSelectDay={day => openSessions(day || "")} />}
      {section === "study" && folderId && <div className={`welcome ${homeStyles.courseWorkspace}`} hidden={!!doc || !!opening}>
        <CourseHeader onSettings={() => setRequestedCourseAction({ folderId, action: "settings", requestId: Date.now() })} folder={folders.find(f => f.id === folderId) || { id: folderId, name: "Esame", createdAt: "" }} />
        <div className={`exam-action-grid${showCourseAnalysis ? "" : " exam-action-grid-complete"}`}>
        {showCourseAnalysis && <CourseAnalysis key={folderId} folderId={folderId} documents={selectedCourseDocuments} configured={configured} disabled={busy || selectedCourseReaderBusy} controller={courseAnalysis} />}
        <section className="upload-zone upload-banner" aria-label="Aggiungi file" onDrop={e => { e.preventDefault(); setDragging(false); void uploadFiles(e.dataTransfer.files); }}><span className="upload-symbol"><Upload size={22} strokeWidth={1.5} /></span><div className="upload-banner-copy"><h2>Aggiungi file</h2><p>Trascina qui PDF o immagini PNG e JPEG · Fino a 500 MB per file</p></div><Button variant="default" className="primary-button" disabled={busy} onClick={() => input.current?.click()}>{busy ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />}{busy ? "Caricamento in corso…" : "Scegli i file"}</Button></section>
        </div>
        <div className={`dashboard-columns ${folderId ? "" : "without-upload"}`}><section className="materials-card"><div className="card-heading"><div><h2>{folderId ? "Materiali dell’esame" : "I tuoi materiali"}</h2><p>Slide, spiegazioni e conversazioni. Tutto nello stesso posto.</p></div><div className="materials-search-field"><label className="sr-only" htmlFor={`materials-search-${folderId}`}>Cerca un materiale</label><div className="materials-search"><Search size={16} aria-hidden="true" /><Input id={`materials-search-${folderId}`} aria-label="Cerca un materiale" placeholder="Cerca nei materiali" value={query} onChange={e => setQuery(e.target.value)} /></div></div></div>
        {library.some(d => !folderId || d.folderId === folderId) ? <MaterialList key={folderId} documents={library.filter(d => d.folderId === folderId)} folder={folders.find(f => f.id === folderId) || { id: folderId, name: "", createdAt: "" }} query={query} busy={busy} openQuiz={quizToOpen} onQuizOpened={() => setQuizToOpen(null)} pendingQuizzes={id => Object.entries(chatController.sessions).filter(([, task]) => task.kind === "quiz" && task.documentId === id && task.status !== "completed").map(([key, task]) => ({ key, status: task.status === "pending" ? "pending" : "error", error: task.error, onRetry: () => chatController.retry(key) }))} isDocumentBusy={id => Object.values(chatController.sessions).some(task => task.documentId === id && task.status === "pending")} onDeleted={id => { setLibrary(items => items.filter(item => item.id !== id)); void refresh(); }} onReadUpdated={async () => { await refresh(); await studySession.reloadHistory(); }} analysisRunning={courseAnalysis.running} onOpen={id => void openDocument(id)} onRenamed={updated => setLibrary(current => current.map(item => item.id === updated.id ? { ...item, name: updated.name, originalName: updated.originalName } : item))} onOrdered={updated => setFolders(current => current.map(f => f.id === updated.id ? updated : f))} /> : <div className="materials-empty"><span className="empty-document-icon"><FileText size={28} strokeWidth={1.5} /></span><h3>Il tuo prossimo passo inizia qui.</h3><p>{folderId ? "Carica le slide di questo esame per iniziare a studiare." : "Crea o apri un esame, poi aggiungi le tue slide."}</p>{!folderId && <Button variant="outline" className="secondary-button" onClick={() => { setSidebar(false); setCreatingFolder(true); }}><Plus size={16} /> Crea il primo esame</Button>}</div>}
        </section></div>

      </div>}
      {opening && <>
        <ReaderSplit><section className={`slide-panel${portrait ? " portrait-pdf" : ""}`}><div className="slide-stage"><BaristaLoading key={opening.id} name={opening.name} error={opening.error} onRetry={() => void openDocument(opening.id)} /></div></section><aside className="explanation-panel reader-chat-panel" aria-label="Tutor della slide"><ChatLoadingSkeleton /></aside></ReaderSplit>
      </>}
      {doc && <>{readerClean && <Button variant="outline" size="icon" className="reader-clean-toggle" aria-label="Mostra tutti i controlli" title="Mostra tutti i controlli" onClick={() => setReaderClean(false)}><Minimize size={19} /></Button>}
        <ReaderSplit clean={readerClean}><section className={`slide-panel${portrait ? " portrait-pdf" : ""}`} style={{ position: "relative" }}><div className={`slide-stage ${activeSlide?.read ? "is-read" : ""}`} ref={viewer}>{pdf && <PdfCanvas pdf={pdf} page={page} zoom={zoom} fitHeight={!(autoFit ? portrait : fitWidth)} onOrientationChange={setPortrait} />}{busy && <div className="viewer-busy"><LoaderCircle className="spin" /> Apertura documento…</div>}</div><BottomPanel key={doc.id}>
          <div className="glossary"><div className="glossary-heading"><span><Languages size={17} /> Le parole della slide</span><span className="language-tag">EN <ArrowRight size={10} /> IT</span></div>{explanation?.glossary.length ? <div className="glossary-words">{explanation.glossary.map(g => <div key={g.word} className="glossary-word" title={g.context}><strong>{g.word}</strong><span>{g.translation}</span><small>{g.context}</small></div>)}</div> : <p>{explanation ? explanation.language === "en" ? "Nessun termine da tradurre individuato in questa slide." : "Questa slide non è in inglese. Puoi concentrarti sui concetti." : "Quando spieghi una slide in inglese, trovi qui i termini importanti con la traduzione italiana."}</p>}</div>
          </BottomPanel>
        </section>
        <aside className="explanation-panel reader-chat-panel" style={{ "--reader-text-size": `${textSize}px` } as React.CSSProperties} aria-label="Tutor della slide"><h1 className="sr-only">{doc.name.replace(/\.pdf$/i, "")}</h1><StudyChat onNavigatePage={target => { if (target !== page) setMapReturn({ documentId: doc.id, page }); navigate(target); }} onReturnToMap={mapReturn?.documentId === doc.id && mapReturn.page !== page ? () => { navigate(mapReturn.page); setMapReturn(null); } : undefined} controller={chatController} documentName={doc.name} courseName={folders.find(folder => folder.id === doc.folderId)?.name} key={`${doc.id}:${page}`} id={doc.id} page={page} folder={doc.folderId} initial={activeSlide?.chat || []} explanation={explanation} onAnalyze={() => void analyze()} onAnalyzeAll={() => void analyzeAll()} analyzing={currentAnalyzing} batchRunning={!!batchRunning && batch?.id === doc.id} analysisBusy={selectedDocumentAnalyzing || !!analyzing || !!batchRunning} configured={configured} disabled={busy} analysisProgress={batch?.id === doc.id ? { completed: batch.completed, total: batch.total, current: batch.current, active: batch.active, status: batch.status } : undefined} onStopAnalysis={stopAnalysis} />
        </aside></ReaderSplit>
      </>}
    </main>
    {dragging && <div className="drop-overlay" onDragLeave={e => { if (e.currentTarget === e.target) setDragging(false); }} onDrop={e => { e.preventDefault(); setDragging(false); void uploadFiles(e.dataTransfer.files); }}><Upload size={46} /><h2>Fai spazio a una nuova idea.</h2><p>Rilascia il PDF per iniziare.</p></div>}
    {!doc && !opening && <MobileNavigation section={section} home={() => openFolder("")} exams={openExams} sessions={() => openSessions()} friends={openFriends} disabled={busy} />}
    {shareTarget && <ShareDialog key={`${shareTarget.kind}:${shareTarget.id}`} target={shareTarget} onClose={() => setShareTarget(null)} />}
    <NewExamDialog folders={folders} open={creatingFolder} onOpenChange={setCreatingFolder} onCreated={async folder => { setFolders(current => [...current.filter(f => f.id !== folder.id), folder]); await refresh(); }} />
    {settings && doc && <ReaderSettingsDialog zoom={zoom} onZoomChange={changeZoom} textSize={textSize} onTextSizeChange={changeTextSize} configured={configured} name={doc.name} page={page} notes={activeSlide?.notes || ""} noteStatus={noteStatus} onNotesChange={saveNotes} hasExplanation={!!explanation} disabled={busy || selectedDocumentAnalyzing || !!analyzing || !!batchRunning} onRegenerate={() => { setSettings(false); void analyze(true); }} onResetZoom={() => changeZoom(1, false)} onClose={() => { flushNotes(); setSettings(false); }} />}
  </div></SidebarProvider>;
}
