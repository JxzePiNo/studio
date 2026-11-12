"use client";
import { useEffect, useRef, useState } from "react";
import { Check, LoaderCircle, Upload, X } from "lucide-react";
import { directUpload } from "@/lib/direct-upload";
import { uploadTransfer } from "@/lib/upload-transfer";
import { MAX_UPLOAD_BYTES, uploadFormat } from "@/lib/upload-formats";
import { authHeaders, firebaseEnabled } from "@/lib/firebase-client";
import { readApiResponse } from "@/lib/api-response";
import { invalidateApiCache } from "@/lib/browser-data-cache";
import type { StudyDocument } from "@/lib/types";
import styles from "./background-uploads.module.css";

type Status = "queued" | "preparing" | "uploading" | "processing" | "completed" | "error" | "cancelled";
type Job = { id: string; folderId: string; folderName: string; name: string; size: number; loaded: number; status: Status; error?: string; documentId?: string };
const active = (job: Job) => ["queued", "preparing", "uploading", "processing"].includes(job.status);
const labels: Record<Status, string> = { queued: "In coda", preparing: "Preparo il caricamento", uploading: "Trasferimento", processing: "Verifica e salvataggio", completed: "Caricato", error: "Non caricato", cancelled: "Annullato" };
export function useBackgroundUploads(onSaved: (document: StudyDocument) => void) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const pending = useRef(false), mounted = useRef(true), running = useRef(false);
  const callback = useRef(onSaved); callback.current = onSaved;
  const queue = useRef<{ job: Job; file: File; abort: AbortController }[]>([]);
  const current = useRef<{ job: Job; abort: AbortController } | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; current.current?.abort.abort(); for (const item of queue.current) item.abort.abort(); queue.current = []; }; }, []);
  function patch(id: string, fields: Partial<Job>) { if (mounted.current) setJobs(values => values.map(job => job.id === id ? { ...job, ...fields } : job)); }
  async function drain() {
    if (running.current) return; running.current = true;
    try {
      while (queue.current.length && mounted.current) {
        const item = queue.current.shift()!; if (item.abort.signal.aborted) continue;
        current.current = item;
        const { job, file, abort } = item;
        try {
          if (!uploadFormat(file.name) || !file.size || file.size > MAX_UPLOAD_BYTES) throw new Error("Scegli PDF, PNG o JPEG non vuoti di massimo 500 MB.");
          patch(job.id, { status: "preparing" });
          const transfer = (url: string, method: string, headers: HeadersInit | undefined, body: File | FormData) => {
            patch(job.id, { status: "uploading" });
            return uploadTransfer(url, { method, headers, body, signal: abort.signal, onProgress: fraction => patch(job.id, { loaded: Math.round(file.size * fraction) }), onSent: () => patch(job.id, { loaded: file.size, status: "processing" }) });
          };
          let document: StudyDocument;
          if (firebaseEnabled) document = await directUpload(file, job.folderId, async <T,>(url: string, init: RequestInit) => readApiResponse<T>(await fetch(url, { ...init, headers: { ...await authHeaders(), ...init.headers } })), (async (url: string | URL | Request, init?: RequestInit) => transfer(String(url), "PUT", init?.headers, file)) as typeof fetch, abort.signal);
          else { const body = new FormData(); body.append("file", file); body.append("folderId", job.folderId); document = await readApiResponse<StudyDocument>(await transfer("/api/documents", "POST", await authHeaders(), body)); }
          await invalidateApiCache("/api/documents", "/api/folders");
          if (mounted.current) { callback.current(document); patch(job.id, { status: "completed", loaded: file.size, documentId: document.id }); }
        } catch (cause) { patch(job.id, { status: item.abort.signal.aborted ? "cancelled" : "error", error: cause instanceof Error ? cause.message : "Caricamento non riuscito." }); }
        finally { current.current = null; }
      }
    } finally { running.current = false; pending.current = false; }
  }
  function enqueue(files: File[], folderId: string, folderName: string) {
    const items = files.map(file => ({ file, abort: new AbortController(), job: { id: crypto.randomUUID(), folderId, folderName, name: file.name, size: file.size, loaded: 0, status: "queued" as Status } }));
    queue.current.push(...items); pending.current = true;
    setJobs(values => [...values, ...items.map(item => item.job)]); void drain();
  }
  function cancel(id: string) { const item = current.current?.job.id === id ? current.current : queue.current.find(item => item.job.id === id); item?.abort.abort(); patch(id, { status: "cancelled" }); }
  return { jobs, enqueue, cancel, pending, dismiss: (id: string) => setJobs(values => values.filter(job => job.id !== id || active(job))) };
}
export type UploadController = ReturnType<typeof useBackgroundUploads>;
export function UploadNotifications({ controller, onOpen }: { controller: UploadController; onOpen: (id: string) => void }) {
  if (!controller.jobs.length) return null;
  return <section className={styles.list} aria-label="Caricamenti in background"><h3>Caricamenti</h3>{controller.jobs.map(job => <article className={styles.job} key={job.id}><header><span>{job.status === "completed" ? <Check size={16} /> : <Upload size={16} />}</span><div><strong>{job.name}</strong><small>{job.folderName}</small></div>{active(job) && <button onClick={() => controller.cancel(job.id)} aria-label={`Annulla caricamento ${job.name}`}><X size={15} /></button>}{!active(job) && <button onClick={() => controller.dismiss(job.id)} aria-label={`Chiudi caricamento ${job.name}`}><X size={15} /></button>}</header><p>{job.error || labels[job.status]}{job.status === "uploading" ? ` · ${Math.floor(job.loaded / Math.max(1, job.size) * 100)}%` : ""}</p>{active(job) && <><progress max={job.size || 1} value={job.status === "uploading" ? job.loaded : undefined} aria-label={`Avanzamento caricamento ${job.name}`} /><small>{(job.loaded / 1024 / 1024).toFixed(1)} / {(job.size / 1024 / 1024).toFixed(1)} MB inviati</small></>}{job.documentId && <button className={styles.open} onClick={() => onOpen(job.documentId!)}>Apri materiale</button>}</article>)}</section>;
}
export function UploadIsland({ controller, summaryHidden }: { controller: UploadController; summaryHidden: boolean }) {
  const items = controller.jobs.filter(active), job = items.find(item => item.status !== "queued") || items[0];
  if (!job) return null;
  return <button className={styles.island} style={{ top: summaryHidden ? 58 : 116 }} onClick={() => window.dispatchEvent(new Event("studio-open-notifications"))} aria-label="Mostra caricamenti in background"><LoaderCircle size={17} className="spin" /><span><strong>{job.name}</strong><small>{labels[job.status]}{job.status === "uploading" ? ` · ${Math.floor(job.loaded / Math.max(1, job.size) * 100)}%` : ""}{items.length > 1 ? ` · altri ${items.length - 1} in coda` : ""}</small><progress max={job.size || 1} value={job.status === "uploading" ? job.loaded : undefined} aria-label="Trasferimento file" /></span></button>;
}
