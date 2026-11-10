"use client";

import { readApiResponse } from "@/lib/api-response";
import { useRef, useState } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpToLine, Check, CircleAlert, Clock3, ChevronRight, FileText, MoreHorizontal, Pencil, ArrowDownAZ, X } from "lucide-react";
import { authHeaders } from "@/lib/firebase-client";
import { orderedMaterials, type MaterialMove } from "@/lib/material-order";
import type { DocumentSummary, ExamFolder, StudyDocument } from "@/lib/types";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

const fileSize = (bytes: number) => bytes < 1024 * 1024
  ? `${Math.ceil(bytes / 1024)} KB`
  : `${(bytes / 1024 / 1024).toLocaleString("it-IT", { maximumFractionDigits: 1 })} MB`;

export function MaterialList({ documents, folder, query, busy, analysisRunning = false, onOpen, onRenamed, onOrdered }: {
  documents: DocumentSummary[]; folder: ExamFolder; query: string; busy: boolean; analysisRunning?: boolean;
  onOpen: (id: string) => void; onRenamed: (doc: StudyDocument) => void; onOrdered: (folder: ExamFolder) => void;
}) {
  const [renaming, setRenaming] = useState<DocumentSummary | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const mutation = useRef(false);
  const openingDialog = useRef(false);
  const lastRenamed = useRef("");
  const sorted = orderedMaterials(documents, folder.documentOrder);
  const visible = sorted.filter(d => d.name.toLowerCase().includes(query.toLowerCase()));
  async function request<T>(url: string, body: unknown): Promise<T> {
    const response = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json", ...await authHeaders() }, body: JSON.stringify(body) });
    const data = await readApiResponse<T>(response);
    return data;
  }
  function edit(doc: DocumentSummary) {
    openingDialog.current = true; lastRenamed.current = doc.id;
    setName(doc.name.replace(/\.pdf$/i, "")); setRenaming(doc); setError("");
  }
  async function rename() {
    if (!renaming || mutation.current || !name.trim()) return;
    mutation.current = true; setSaving(true); setError("");
    try { onRenamed(await request<StudyDocument>(`/api/documents/${renaming.id}/details`, { name: name.trim() })); setRenaming(null); }
    catch(e) { setError((e as Error).message); }
    finally { setSaving(false); mutation.current = false; }
  }
  async function move(doc: DocumentSummary, direction: MaterialMove) {
    if (mutation.current) return;
    mutation.current = true; setSaving(true); setError("");
    try { onOrdered(await request<ExamFolder>(`/api/folders/${folder.id}/order`, { documentId: doc.id, move: direction })); }
    catch(e) { setError((e as Error).message); }
    finally { setSaving(false); mutation.current = false; }
  }
  function items(doc: DocumentSummary, context: boolean) {
    const Item = context ? ContextMenu.Item : DropdownMenu.Item;
    const Separator = context ? ContextMenu.Separator : DropdownMenu.Separator;
    const index = sorted.findIndex(d => d.id === doc.id);
    return <>
      <Item className="material-menu-item" onSelect={() => edit(doc)} disabled={busy || saving || analysisRunning}><Pencil size={15} /> Rinomina</Item>
      <Separator className="material-menu-separator" />
      <Item className="material-menu-item" onSelect={() => void move(doc, "up")} disabled={busy || saving || analysisRunning || index === 0}><ArrowUp size={15} /> Sposta su</Item>
      <Item className="material-menu-item" onSelect={() => void move(doc, "down")} disabled={busy || saving || analysisRunning || index === sorted.length - 1}><ArrowDown size={15} /> Sposta giù</Item>
      <Item className="material-menu-item" onSelect={() => void move(doc, "first")} disabled={busy || saving || analysisRunning || index === 0}><ArrowUpToLine size={15} /> Sposta all’inizio</Item>
      <Item className="material-menu-item" onSelect={() => void move(doc, "last")} disabled={busy || saving || analysisRunning || index === sorted.length - 1}><ArrowDownToLine size={15} /> Sposta in fondo</Item>
      <Separator className="material-menu-separator" />
      <Item className="material-menu-item" onSelect={() => void move(doc, "name")} disabled={busy || saving || analysisRunning || sorted.length < 2}><ArrowDownAZ size={15} /> Ordina per nome</Item>
    </>;
  }
  const closeMenuFocus = (event: Event) => { if (openingDialog.current) { event.preventDefault(); openingDialog.current = false; } };
  return <>
    {error && !renaming && <p className="material-error" role="alert">{error}</p>}
    <div className="materials-list" aria-label="Materiali dell’esame" aria-busy={saving}>
      {!visible.length && <p className="materials-no-results">Nessun materiale corrisponde alla ricerca.</p>}
      {visible.map(item => <ContextMenu.Root key={item.id}>
        <ContextMenu.Trigger asChild disabled={busy || saving || analysisRunning}><div className="material-row" data-document-id={item.id} tabIndex={0}>
          <Button variant="ghost" className="material-open" disabled={busy || saving} aria-label={`Apri ${item.name.replace(/\.pdf$/i, "")}`} onClick={() => onOpen(item.id)}><span className="material-icon"><FileText size={20} /></span><span className="material-info"><strong>{item.name.replace(/\.pdf$/i, "")}</strong><span className="material-details"><small>{item.pages} slide / {fileSize(item.size)}</small><span className={`material-analysis-badge ${item.analyzedPages >= item.pages && item.pages > 0 ? "is-analyzed" : item.analyzedPages > 0 ? "is-partial" : "is-pending"}`} role="status">{item.analyzedPages >= item.pages && item.pages > 0 ? <><Check size={12} aria-hidden="true" />Analizzato</> : item.analyzedPages > 0 ? <><Clock3 size={12} aria-hidden="true" />Parzialmente analizzato</> : <><CircleAlert size={12} aria-hidden="true" />Da analizzare</>}</span></span></span><span className="material-progress"><span>{(item.readPages || 0) / item.pages >= .95 ? `Letto / ${item.readPages}/${item.pages}` : `${item.readPages || 0}/${item.pages} lette`}</span><progress max={item.pages} value={item.readPages || 0} aria-label={`Avanzamento ${item.name}`} /></span><ChevronRight size={16} /></Button>
          <DropdownMenu.Root><DropdownMenu.Trigger asChild><Button variant="ghost" size="icon" className="material-more" aria-label={`Azioni ${item.name.replace(/\.pdf$/i, "")}`} disabled={busy || saving || analysisRunning}><MoreHorizontal size={18} /></Button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="material-menu-content" align="end" sideOffset={5} onCloseAutoFocus={closeMenuFocus}>{items(item, false)}</DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
        </div></ContextMenu.Trigger>
        <ContextMenu.Portal><ContextMenu.Content className="material-menu-content" onCloseAutoFocus={closeMenuFocus}>{items(item, true)}</ContextMenu.Content></ContextMenu.Portal>
      </ContextMenu.Root>)}
    </div>
    <Dialog.Root open={!!renaming} onOpenChange={open => { if (!open && !saving) setRenaming(null); }}><Dialog.Portal><Dialog.Overlay className="plan-overlay" /><Dialog.Content className="plan-dialog" onEscapeKeyDown={e => { if (saving) e.preventDefault(); }} onPointerDownOutside={e => { if (saving) e.preventDefault(); }} onCloseAutoFocus={e => { e.preventDefault(); document.querySelector<HTMLButtonElement>(`[data-document-id="${lastRenamed.current}"] .material-open`)?.focus(); }}>
      <Dialog.Title>Rinomina materiale</Dialog.Title><Dialog.Description>Scegli un nome per ritrovarlo nell’esame. Il PDF e gli appunti restano collegati.</Dialog.Description><Dialog.Close asChild><Button variant="ghost" size="icon" className="plan-dialog-close" aria-label="Chiudi rinomina" disabled={saving}><X size={18} /></Button></Dialog.Close>
      <form className="plan-form" onSubmit={e => { e.preventDefault(); void rename(); }}><label>Nome del materiale<Input value={name} onChange={e => setName(e.target.value)} maxLength={200} placeholder="Es. Lezione 1" disabled={saving} required /></label>{error && <p className="plan-error" role="alert">{error}</p>}<div className="plan-form-actions"><Dialog.Close asChild><Button variant="outline" disabled={saving}>Annulla</Button></Dialog.Close><Button type="submit" disabled={saving || !name.trim()}>{saving ? "Salvataggio…" : "Salva nome"}</Button></div></form>
    </Dialog.Content></Dialog.Portal></Dialog.Root>
  </>;
}
