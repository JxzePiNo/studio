"use client";
import { useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import dynamic from "next/dynamic";
import { Download, Maximize2, Pencil, Save, X } from "lucide-react";
import { artifactNames, validateArtifact, type StudyArtifact } from "@/lib/study-artifact";
import { graphSvg } from "@/lib/artifact-layout";
import { authHeaders } from "@/lib/firebase-client";
import { readApiResponse } from "@/lib/api-response";
import { invalidateApiCache } from "@/lib/browser-data-cache";
import type { ChatMessage } from "@/lib/types";
import { ArtifactImage } from "./artifact-image";
import { Button } from "./ui/button";
import styles from "./study-artifact.module.css";

const ArtifactGraph = dynamic(() => import("./artifact-graph").then(module => module.ArtifactGraph), { ssr: false, loading: () => <p>Preparo la mappa…</p> });

export function StudyArtifactView({ artifact, documentId, page, onSaved, preview = false, onNavigatePage, standalone = false, onClose, headerActions }: { artifact: StudyArtifact; documentId: string; page: number; onSaved?: (messages: ChatMessage[]) => void; preview?: boolean; onNavigatePage?: (page: number) => void; standalone?: boolean; onClose?: () => void; headerActions?: ReactNode }) {
  const [draft, setDraft] = useState(artifact);
  const [editing, setEditing] = useState(false);
  const [fullscreen, setFullscreen] = useState(standalone);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dirty = JSON.stringify(draft) !== JSON.stringify(artifact);
  async function save() {
    setSaving(true); setError("");
    try {
      validateArtifact(draft);
      const response = await fetch(`/api/documents/${documentId}/visualizations`, { method: "PATCH", headers: { "Content-Type": "application/json", ...await authHeaders() }, body: JSON.stringify({ page, artifact: draft }) });
      const messages = await readApiResponse<ChatMessage[]>(response, "Salvataggio non riuscito.");
      await invalidateApiCache(`/api/documents/${documentId}`); onSaved?.(messages); setEditing(false);
    } catch (cause) { setError((cause as Error).message); } finally { setSaving(false); }
  }
  function download() {
    if (draft.kind === "image") return;
    const url = URL.createObjectURL(new Blob([graphSvg(draft)], { type: "image/svg+xml" }));
    const link = document.createElement("a"); link.href = url; link.download = `${draft.title.replace(/[^a-z0-9àèéìòù -]/gi, "").slice(0, 80) || "mappa"}.svg`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const content = <>
    <div className={styles.actions}><Button variant="outline" size="sm" aria-pressed={editing} disabled={saving} onClick={() => setEditing(value => !value)}><Pencil size={14} />{editing ? "Fine modifiche" : "Modifica"}</Button>{draft.kind !== "image" && <><Button variant="ghost" size="sm" onClick={() => setDraft({ ...draft, layout: undefined })}>Riordina</Button><Button variant="ghost" size="sm" onClick={download}><Download size={14} /> SVG</Button></>}{dirty && !preview && <Button size="sm" disabled={saving} onClick={() => void save()}><Save size={14} />{saving ? "Salvo…" : "Salva modifiche"}</Button>}{dirty && <Button variant="ghost" size="sm" disabled={saving} onClick={() => { setDraft(artifact); setError(""); }}>Annulla modifiche</Button>}</div>
    {editing && <label className={styles.titleInput}>Titolo<input value={draft.title} maxLength={120} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>}
    {draft.kind === "image" ? <ArtifactImage artifact={draft} documentId={documentId} editing={editing} onChange={setDraft} /> : <ArtifactGraph graph={draft} editing={editing} onChange={setDraft} onNavigatePage={onNavigatePage ? target => { setFullscreen(false); onClose?.(); onNavigatePage(target); } : undefined} />}
    {error && <p role="alert" className={styles.error}>{error}</p>}{draft.note && <p className={styles.note}>{draft.note}</p>}
  </>;
  return <section className={standalone ? undefined : styles.artifact} style={standalone ? { display: "contents" } : undefined} aria-label={`${artifactNames[draft.kind]}: ${draft.title}`} data-artifact-id={artifact.id}>
    {!standalone && <>
    <header className={styles.artifactHeading}><div><small>{artifactNames[draft.kind]}</small><h3>{draft.title}</h3></div><Button variant="ghost" size="icon" aria-label="Apri a schermo intero" onClick={() => setFullscreen(true)}><Maximize2 size={17} /></Button></header>
    <p className={styles.summary}>{draft.summary}</p>{!fullscreen && content}</>}
    <Dialog.Root open={fullscreen} onOpenChange={open => { setFullscreen(open); if (!open) onClose?.(); }}><Dialog.Portal><Dialog.Overlay className={styles.overlay} /><Dialog.Content className={`${styles.dialog} ${styles.fullscreen}`}><header className={styles.heading}><div><Dialog.Title>{draft.title}</Dialog.Title><Dialog.Description>Esplora e modifica il materiale.</Dialog.Description></div>{headerActions}<Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="Chiudi schermo intero"><X size={18} /></Button></Dialog.Close></header>{content}</Dialog.Content></Dialog.Portal></Dialog.Root>
  </section>;
}
