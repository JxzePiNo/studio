"use client";
import { useEffect, useRef, useState } from "react";
import type { ImageArtifact } from "@/lib/study-artifact";
import { authHeaders } from "@/lib/firebase-client";
import { readApiResponse } from "@/lib/api-response";
import { MarkdownContent } from "./markdown-content";
import styles from "./study-artifact.module.css";

export function ArtifactImage({ artifact, documentId, editing, onChange }: { artifact: ImageArtifact; documentId: string; editing: boolean; onChange: (artifact: ImageArtifact) => void }) {
  const [source, setSource] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(artifact.hotspots[0]?.id || "");
  const canvas = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController(); let objectUrl = "";
    void (async () => {
      try {
        const response = await fetch(`/api/documents/${documentId}/visualizations/${artifact.image.assetId}/image`, { headers: await authHeaders(), signal: controller.signal });
        if (!response.ok) await readApiResponse(response, "Impossibile aprire l'immagine.");
        const blob = await response.blob(); if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob); setSource(objectUrl);
      } catch (cause) { if (!controller.signal.aborted) setError((cause as Error).message); }
    })();
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [documentId, artifact.image.assetId]);
  const active = artifact.hotspots.find(point => point.id === selected) || artifact.hotspots[0];
  function update(fields: Partial<typeof active>) { onChange({ ...artifact, hotspots: artifact.hotspots.map(point => point.id === active?.id ? { ...point, ...fields } : point) }); }
  return <div>
    {error ? <p role="alert">{error}</p> : !source ? <p role="status">Apro l'immagine…</p> : <div ref={canvas} className={styles.image}>
      {/* Authenticated images are fetched as blobs so private assets never need public URLs. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={source} width={artifact.image.width} height={artifact.image.height} alt={artifact.title} draggable={false} />
      {artifact.hotspots.map((point, index) => <button key={point.id} style={{ left: `${point.x}%`, top: `${point.y}%`, background: point.color }} aria-label={point.label} aria-pressed={active?.id === point.id} title={point.label} onMouseEnter={() => { if (!editing) setSelected(point.id); }} onFocus={() => setSelected(point.id)} onClick={() => setSelected(point.id)} onPointerDown={event => { if (editing) { setSelected(point.id); event.currentTarget.setPointerCapture(event.pointerId); } }} onPointerMove={event => { if (!editing || !event.currentTarget.hasPointerCapture(event.pointerId)) return; const bounds = canvas.current!.getBoundingClientRect(); const x = Math.min(99, Math.max(1, (event.clientX - bounds.left) / bounds.width * 100)); const y = Math.min(99, Math.max(1, (event.clientY - bounds.top) / bounds.height * 100)); onChange({ ...artifact, hotspots: artifact.hotspots.map(item => item.id === point.id ? { ...item, x, y } : item) }); }}>{index + 1}</button>)}
    </div>}
    <div className={styles.parts} aria-label="Parti dell'immagine">{artifact.hotspots.map(point => <button key={point.id} aria-pressed={active?.id === point.id} onClick={() => setSelected(point.id)}>{point.label}</button>)}</div>
    {active && <section className={styles.detail} aria-label="Spiegazione della parte" aria-live="polite">{editing ? <><p>Trascina i punti per correggere la loro posizione.</p><label>Nome<input value={active.label} maxLength={100} onChange={event => update({ label: event.target.value })} /></label><label>Spiegazione<textarea value={active.description} maxLength={1200} rows={3} onChange={event => update({ description: event.target.value })} /></label></> : <><strong>{active.label}</strong><MarkdownContent>{active.description}</MarkdownContent></>}</section>}
  </div>;
}
