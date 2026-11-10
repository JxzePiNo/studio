"use client";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { LoaderCircle } from "lucide-react";

export async function loadPdf(url: string, httpHeaders?: Record<string, string>, signal?: AbortSignal) {
  const pdfjs = await import("pdfjs-dist");
  signal?.throwIfAborted();
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const task = pdfjs.getDocument({ url, httpHeaders, isEvalSupported: false });
  let rejectAbort!: (reason: unknown) => void;
  const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const abort = () => { void task.destroy().catch(() => {}); rejectAbort(signal?.reason || new DOMException("Caricamento annullato", "AbortError")); };
  signal?.addEventListener("abort", abort, { once: true });
  try { return await Promise.race([task.promise, aborted]); }
  finally { signal?.removeEventListener("abort", abort); }
}
export function PdfCanvas({ pdf, page, zoom = 1, thumbnail = false, fitHeight = false }: { pdf: PDFDocumentProxy; page: number; zoom?: number; thumbnail?: boolean; fitHeight?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [visible, setVisible] = useState(!thumbnail);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const element = container.current; if (!element) return;
    const observer = new ResizeObserver(() => {
      setWidth(element.clientWidth);
      const parent = element.parentElement;
      if (fitHeight && parent) {
        const style = getComputedStyle(parent);
        setHeight(Math.max(0, parent.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)));
      }
    });
    observer.observe(element);
    if (fitHeight && element.parentElement) observer.observe(element.parentElement);
    const intersection = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setVisible(true); intersection.disconnect(); } });
    intersection.observe(element);
    return () => { observer.disconnect(); intersection.disconnect(); };
  }, [fitHeight]);
  useEffect(() => {
    if (!width || !visible) return;
    let canceled = false;
    let task: RenderTask | undefined;
    setLoading(true); setError("");
    // Each render uses a detached canvas so resizing never races a canceled render.
    const render = async () => {
      try {
        const p = await pdf.getPage(page);
        if (canceled) return;
        const base = p.getViewport({ scale: 1 });
        const ratio = thumbnail ? 1 : Math.min(window.devicePixelRatio || 1, 2);
        const scale = fitHeight && height > 0 ? Math.min(width / base.width, height / base.height) : width / base.width;
        const viewport = p.getViewport({ scale: scale * zoom * ratio });
        const offscreen = document.createElement("canvas");
        offscreen.width = viewport.width; offscreen.height = viewport.height;
        task = p.render({ canvasContext: offscreen.getContext("2d")!, viewport });
        await task.promise;
        if (canceled || !canvas.current) return;
        canvas.current.width = offscreen.width; canvas.current.height = offscreen.height;
        canvas.current.style.width = `${viewport.width / ratio}px`;
        canvas.current.style.height = `${viewport.height / ratio}px`;
        canvas.current.getContext("2d")!.drawImage(offscreen, 0, 0);
        setLoading(false);
      } catch (e) { if (!canceled) { setError(e instanceof Error ? "Impossibile visualizzare questa pagina." : "Errore PDF."); setLoading(false); } }
    };
    void render();
    return () => { canceled = true; task?.cancel(); };
  }, [pdf, page, width, height, zoom, visible, thumbnail, fitHeight]);
  return <div ref={container} className={`pdf-canvas ${thumbnail ? "thumbnail-canvas" : ""}`}>
    <canvas ref={canvas} aria-label={`Slide ${page}`} role="img" style={{ visibility: loading || error ? "hidden" : "visible" }} />
    {loading && <div className="canvas-loader"><LoaderCircle className="spin" size={thumbnail ? 16 : 24} /><span className={thumbnail ? "sr-only" : ""}>Caricamento slide…</span></div>}
    {error && <p className="canvas-loader error-text">{error}</p>}
  </div>;
}
