"use client";

import { useState, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as Dialog from "@radix-ui/react-dialog";
import { GitBranch, Image, MoreHorizontal, Network, Pencil, Trash2, X } from "lucide-react";
import { authHeaders } from "@/lib/firebase-client";
import { readApiResponse } from "@/lib/api-response";
import { invalidateApiCache } from "@/lib/browser-data-cache";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import type { GeneratedMaterial } from "./background-chat";
import type { ChatMessage } from "@/lib/types";
import { TonyMascot } from "./mascot/tony-mascot";
import { StudyArtifactView } from "./study-artifact-view";
import notificationStyles from "./notification-center.module.css";
import styles from "./generated-materials.module.css";

export function GeneratedMaterials({ items, onNavigatePage, onSaved }: { items: GeneratedMaterial[]; onNavigatePage: (item: GeneratedMaterial, page: number) => void; onSaved: (id: string, page: number, messages: ChatMessage[]) => void }) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [action, setAction] = useState<{ item: GeneratedMaterial; kind: "rename" | "delete" } | null>(null);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  function choose(item: GeneratedMaterial, kind: "rename" | "delete") { setOpen(false); setSelectedId(null); setTitle(item.artifact.title); setError(""); setAction({ item, kind }); }
  async function saveAction() {
    if (!action || saving) return;
    setSaving(true); setError("");
    try {
      const { item, kind } = action;
      const response = await fetch(`/api/documents/${item.documentId}/visualizations`, { method: kind === "rename" ? "PATCH" : "DELETE", headers: { "Content-Type": "application/json", ...await authHeaders() }, body: JSON.stringify({ page: item.page, ...(kind === "rename" ? { artifact: { ...item.artifact, title: title.trim() } } : { artifactId: item.artifact.id }) }) });
      const messages = await readApiResponse<ChatMessage[]>(response);
      await invalidateApiCache(`/api/documents/${item.documentId}`);
      onSaved(item.documentId, item.page, messages); setAction(null);
    } catch (cause) { setError((cause as Error).message); } finally { setSaving(false); }
  }
  const selected = items.find(item => item.artifact.id === selectedId);
  if (!items.length) return null;
  const one = items.length === 1 ? items[0] : null;
  const Icon = one?.artifact.kind === "image" ? Image : one?.artifact.kind === "diagram" ? GitBranch : Network;
  const label = !one ? "Generazioni" : one.artifact.kind === "image" ? "Apri Immagine" : one.artifact.kind === "diagram" ? "Apri Schema" : "Apri Mappa";
  return <>
    <Popover.Root modal open={open && items.length > 1} onOpenChange={next => { if (next && one) setSelectedId(one.artifact.id); else setOpen(next); }}>
      <Popover.Trigger asChild><button className={styles.trigger} aria-label={one ? label : `Generazioni, ${items.length} materiali`} title={label}><Icon size={15} aria-hidden="true" /><span>{label}</span>{!one && <i className={notificationStyles.badge} aria-hidden="true">{items.length}</i>}</button></Popover.Trigger>
      <Popover.Portal><Popover.Content side="bottom" align="end" sideOffset={10} collisionPadding={14} className={notificationStyles.dialog} aria-label="Materiali generati">
        <header className={notificationStyles.heading}><h2>Le tue generazioni</h2><Popover.Close asChild><button aria-label="Chiudi generazioni"><X size={18} /></button></Popover.Close></header>
        <div className={notificationStyles.tony}><TonyMascot size={72} showName={false} /><div className={notificationStyles.speech}><strong>Tony del bar</strong><p>Mappe, immagini e schemi pronti. Scegli cosa vuoi aprire.</p></div></div>
        <ul className={styles.list}>{items.map(item => <MaterialContext key={item.artifact.id} item={item} onAction={choose}><li className={styles.row}><button className={styles.openMaterial} onClick={() => { setOpen(false); setSelectedId(item.artifact.id); }}><strong>{item.artifact.title}</strong><span>{item.name} · Pagina {item.page}</span></button><MaterialMenu item={item} onAction={choose} /></li></MaterialContext>)}</ul>
      </Popover.Content></Popover.Portal>
    </Popover.Root>
    {selected && <StudyArtifactView key={selected.artifact.id} artifact={selected.artifact} documentId={selected.documentId} page={selected.page} standalone headerActions={<MaterialMenu item={selected} onAction={choose} />} onClose={() => setSelectedId(null)} onNavigatePage={page => onNavigatePage(selected, page)} onSaved={messages => onSaved(selected.documentId, selected.page, messages)} />}
    <Dialog.Root open={!!action} onOpenChange={next => { if (!next && !saving) setAction(null); }}><Dialog.Portal><Dialog.Overlay className={styles.actionOverlay} /><Dialog.Content className={styles.actionDialog} onEscapeKeyDown={event => { if (saving) event.preventDefault(); }} onInteractOutside={event => { if (saving) event.preventDefault(); }}><Dialog.Title>{action?.kind === "rename" ? "Rinomina generazione" : "Elimina generazione"}</Dialog.Title><Dialog.Description>{action?.kind === "rename" ? "Scegli un nome per ritrovare il materiale." : `Eliminare «${action?.item.artifact.title || ""}» dalle generazioni e dalla chat?`}</Dialog.Description><form onSubmit={event => { event.preventDefault(); void saveAction(); }}>{action?.kind === "rename" && <label className="form-field"><span className="form-field-label">Nome</span><Input autoFocus value={title} onChange={event => setTitle(event.target.value)} maxLength={120} required disabled={saving} /></label>}{error && <p role="alert" className={styles.error}>{error}</p>}<footer><Button variant="outline" disabled={saving} onClick={() => setAction(null)}>Annulla</Button><Button type="submit" variant={action?.kind === "delete" ? "destructive" : "default"} disabled={saving || (action?.kind === "rename" && !title.trim())}>{saving ? "Salvo…" : action?.kind === "rename" ? "Salva" : "Elimina"}</Button></footer></form></Dialog.Content></Dialog.Portal></Dialog.Root>
  </>;
}

type MaterialActions = { item: GeneratedMaterial; onAction: (item: GeneratedMaterial, kind: "rename" | "delete") => void };
function MaterialMenu({ item, onAction }: MaterialActions) {
  return <DropdownMenu.Root><DropdownMenu.Trigger asChild><button className={styles.more} aria-label={`Azioni ${item.artifact.title}`}><MoreHorizontal size={18} /></button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className={`material-menu-content ${styles.menu}`} sideOffset={5} onCloseAutoFocus={event => event.preventDefault()}><DropdownMenu.Item className="material-menu-item" onSelect={() => onAction(item, "rename")}><Pencil size={15} />Rinomina</DropdownMenu.Item><DropdownMenu.Item className="material-menu-item" onSelect={() => onAction(item, "delete")}><Trash2 size={15} />Elimina</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>;
}
function MaterialContext({ item, onAction, children }: MaterialActions & { children: ReactNode }) {
  return <ContextMenu.Root><ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger><ContextMenu.Portal><ContextMenu.Content className={`material-menu-content ${styles.menu}`} onCloseAutoFocus={event => event.preventDefault()}><ContextMenu.Item className="material-menu-item" onSelect={() => onAction(item, "rename")}><Pencil size={15} />Rinomina</ContextMenu.Item><ContextMenu.Item className="material-menu-item" onSelect={() => onAction(item, "delete")}><Trash2 size={15} />Elimina</ContextMenu.Item></ContextMenu.Content></ContextMenu.Portal></ContextMenu.Root>;
}
