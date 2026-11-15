"use client";
import { openShare } from "@/lib/sharing-client";
import { trackedFetch, invalidateApiCache } from "@/lib/browser-data-cache";

import { readApiResponse } from "@/lib/api-response";
import { useEffect, useRef, useState } from "react";
import type { DocumentBulkInput, DocumentBulkResult } from "@/lib/document-bulk";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpToLine, Share2, Check, CircleAlert, Clock3, ChevronRight, MoreHorizontal, Pencil, ArrowDownAZ, Trash2, X } from "lucide-react";
import { authHeaders } from "@/lib/firebase-client";
import { orderedMaterials, type MaterialMove } from "@/lib/material-order";
import type { DocumentSummary, ExamFolder, StudyDocument } from "@/lib/types";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ReadRangeDialog } from "./read-range-dialog";
import { DocumentQuizzes, type PendingQuiz } from "./document-quizzes";

export function MaterialList({ documents, folder, query, busy, analysisRunning = false, onOpen, onRenamed, onOrdered, onReadUpdated, onStudyChanged, onDeleted, onBulkDeleted, onBulkStudyChanged, isDocumentBusy, pendingQuizzes, openQuiz, onQuizOpened }: {
  documents: DocumentSummary[]; folder: ExamFolder; query: string; busy: boolean; analysisRunning?: boolean;
  onOpen: (id: string) => void; onRenamed: (doc: StudyDocument) => void; onOrdered: (folder: ExamFolder) => void;
  onReadUpdated?: () => Promise<void> | void;
  onStudyChanged?: (id: string, excluded: boolean) => void;
  onDeleted?: (id: string) => void; isDocumentBusy?: (id: string) => boolean;
  onBulkDeleted?: (ids: string[]) => void;
  onBulkStudyChanged?: (ids: string[], excluded: boolean) => void;
  pendingQuizzes?: (id: string) => PendingQuiz[]; openQuiz?: { documentId: string; quizId: string } | null; onQuizOpened?: () => void;
}) {
  const [renaming, setRenaming] = useState<DocumentSummary | null>(null);
  const [reading, setReading] = useState<DocumentSummary | null>(null);
  const [deleting, setDeleting] = useState<DocumentSummary | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [status, setStatus] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [tourMenuId, setTourMenuId] = useState<string | null>(null);
  useEffect(() => {
    const change = (event: Event) => {
      const { open, id } = (event as CustomEvent<{ open: boolean; id?: string }>).detail;
      if (open && id && documents.some(document => document.id === id)) { setTourMenuId(id); setOpenMenuId(id); }
      else if (!open) { setOpenMenuId(null); setTourMenuId(null); }
    };
    window.addEventListener("studio-tour-material-menu", change);
    return () => window.removeEventListener("studio-tour-material-menu", change);
  }, [documents]);
  useEffect(() => { setSelected([]); }, [query]);
  const mutation = useRef(false);
  const openingDialog = useRef(false);
  const lastRenamed = useRef("");
  const sorted = orderedMaterials(documents, folder.documentOrder);
  const visible = sorted.filter(d => d.name.toLowerCase().includes(query.toLowerCase()));
  const selection = selected.filter(id => documents.some(document => document.id === id));
  const selectable = visible.slice(0, 100);
  const allSelected = selectable.length > 0 && selectable.every(document => selection.includes(document.id));
  const deletionBlocked = analysisRunning || selection.some(id => isDocumentBusy?.(id));
  function select(id: string) { setSelected(current => current.includes(id) ? current.filter(value => value !== id) : current.length < 100 ? [...current, id] : current); }
  async function bulkAction(action: DocumentBulkInput["action"]) {
    if (mutation.current || busy || !selection.length || (action === "delete" && deletionBlocked)) return;
    const ids = [...selection];
    mutation.current = true; setSaving(true); setError(""); setStatus("");
    try {
      const response = await trackedFetch("/api/documents/bulk", { method: "POST", headers: { "Content-Type": "application/json", ...await authHeaders() }, body: JSON.stringify({ folderId: folder.id, ids, action }) });
      const result = await readApiResponse<DocumentBulkResult>(response);
      if (action === "delete") {
        if (onBulkDeleted) onBulkDeleted(result.succeeded); else result.succeeded.forEach(id => onDeleted?.(id));
        setSelected(result.failed); setBulkDeleting(false);
      } else {
        if (onBulkStudyChanged) onBulkStudyChanged(result.succeeded, action === "exclude"); else result.succeeded.forEach(id => onStudyChanged?.(id, action === "exclude"));
        if (result.failed.length) setSelected(result.failed);
      }
      if (result.succeeded.length) setStatus(`${result.succeeded.length} PDF ${action === "delete" ? "eliminati" : action === "exclude" ? "esclusi dalle statistiche" : "inclusi nelle statistiche"}.`);
      if (result.failed.length) setError(`${result.failed.length} PDF non aggiornati. Restano selezionati: puoi riprovare.`);
    } catch (cause) { setError((cause as Error).message); }
    finally { mutation.current = false; setSaving(false); }
  }
  async function request<T>(url: string, body: unknown): Promise<T> {
    const response = await trackedFetch(url, { method: "PATCH", headers: { "Content-Type": "application/json", ...await authHeaders() }, body: JSON.stringify(body) });
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
  async function toggleStudy(doc: DocumentSummary) {
    if (mutation.current) return;
    mutation.current = true; setSaving(true); setError("");
    try {
      const result = await request<{ id: string; excludedFromStudy: boolean }>(`/api/documents/${doc.id}/study-settings`, { excludedFromStudy: !doc.excludedFromStudy });
      await invalidateApiCache(`/api/documents/${doc.id}`);
      onStudyChanged?.(result.id, result.excludedFromStudy);
    } catch (cause) { setError((cause as Error).message); }
    finally { mutation.current = false; setSaving(false); }
  }
  async function remove() {
    if (!deleting || mutation.current || isDocumentBusy?.(deleting.id)) return;
    mutation.current = true; setSaving(true); setError("");
    try {
      const response = await trackedFetch(`/api/documents/${deleting.id}`, { method: "DELETE", headers: await authHeaders() });
      await readApiResponse(response, "Impossibile eliminare il file. Riprova.");
      onDeleted?.(deleting.id); setDeleting(null);
    } catch (cause) { setError((cause as Error).message); }
    finally { mutation.current = false; setSaving(false); }
  }
  function items(doc: DocumentSummary, context: boolean) {
    const Item = context ? ContextMenu.Item : DropdownMenu.Item;
    const Separator = context ? ContextMenu.Separator : DropdownMenu.Separator;
    const index = sorted.findIndex(d => d.id === doc.id);
    return <>
      <Item data-tour-action="study-inclusion" className="material-menu-item" onSelect={() => void toggleStudy(doc)} disabled={busy || saving}><Check size={15} />{doc.excludedFromStudy ? "Includi nelle statistiche" : "Escludi dalle statistiche"}</Item>
      <Item data-tour-action="read-pages" className="material-menu-item" onSelect={() => { openingDialog.current = true; lastRenamed.current = doc.id; setReading(doc); }} disabled={busy || saving || analysisRunning || doc.pages < 1}><Check size={15} /> Segna pagine lette</Item>
      {folder.sharedRole !== "coauthor" && <Item className="material-menu-item" onSelect={() => { openingDialog.current = true; openShare({ kind: "pdf", id: doc.id, name: doc.name }); }} disabled={busy || saving}><Share2 size={15} /> Condividi PDF</Item>}
      <Item className="material-menu-item" onSelect={() => edit(doc)} disabled={busy || saving || analysisRunning}><Pencil size={15} /> Rinomina</Item>
      <Item data-tour-action="delete-file" className="material-menu-item" onSelect={() => { openingDialog.current = true; lastRenamed.current = doc.id; setDeleting(doc); setError(""); }} disabled={busy || saving || analysisRunning || isDocumentBusy?.(doc.id)}><Trash2 size={15} /> Elimina file</Item>
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
    {documents.length > 0 && <div className="material-selection-bar" aria-label="Azioni sui PDF selezionati">
      <label><input type="checkbox" aria-label="Seleziona tutti i PDF visibili" checked={allSelected} ref={element => { if (element) element.indeterminate = !allSelected && selection.length > 0; }} disabled={busy || saving || !selectable.length} onChange={event => { setStatus(""); setSelected(event.target.checked ? selectable.map(document => document.id) : []); }} /> Seleziona tutti{visible.length > 100 ? " (primi 100)" : ""}</label>
      <span aria-live="polite">{selection.length} selezionati</span>
      {selection.length > 0 && <><Button variant="outline" size="sm" disabled={busy || saving} onClick={() => void bulkAction("exclude")}>Escludi dalle statistiche</Button><Button variant="outline" size="sm" disabled={busy || saving} onClick={() => void bulkAction("include")}>Includi nelle statistiche</Button><Button variant="outline" size="sm" disabled={busy || saving || deletionBlocked} onClick={() => { setError(""); setBulkDeleting(true); }}><Trash2 size={14} /> Elimina selezionati</Button><Button variant="ghost" size="sm" disabled={saving} onClick={() => setSelected([])}>Annulla selezione</Button></>}
      {selection.length > 0 && deletionBlocked && <small>Attendi la fine delle operazioni in corso per eliminare questi file.</small>}
    </div>}
    {status && <p className="material-bulk-status" role="status">{status}</p>}
    {reading && <ReadRangeDialog key={reading.id} document={reading} onSaved={onReadUpdated} onClose={() => setReading(null)} />}
    {error && !renaming && <p className="material-error" role="alert">{error}</p>}
    <div className="materials-list" aria-label="Materiali dell’esame" aria-busy={saving}>
      {!visible.length && <p className="materials-no-results">Nessun materiale corrisponde alla ricerca.</p>}
      {visible.map(item => <div key={item.id}><ContextMenu.Root>
        <ContextMenu.Trigger asChild disabled={busy || saving || analysisRunning}><div className="material-row" data-excluded-from-study={!!item.excludedFromStudy} data-document-id={item.id} tabIndex={0}>
          <label className="material-select"><input type="checkbox" aria-label={`Seleziona ${item.name}`} checked={selection.includes(item.id)} disabled={busy || saving || (!selection.includes(item.id) && selection.length >= 100)} onChange={() => { setStatus(""); select(item.id); }} /></label>
          <Button variant="ghost" className="material-open" disabled={busy || saving} aria-label={`Apri ${item.name.replace(/\.pdf$/i, "")}`} onClick={() => onOpen(item.id)}><span className="material-lesson" aria-label={`Lezione ${sorted.findIndex(document => document.id === item.id) + 1}`}><span>Lezione</span><strong>{String(sorted.findIndex(document => document.id === item.id) + 1).padStart(2, "0")}</strong></span><span className="material-info"><span className="material-title-row"><strong className="material-title">{item.name.replace(/\.pdf$/i, "")}.pdf</strong><span className={`material-analysis-badge ${item.analyzedPages >= item.pages && item.pages > 0 ? "is-analyzed" : item.analyzedPages > 0 ? "is-partial" : "is-pending"}`} role="status">{item.analyzedPages >= item.pages && item.pages > 0 ? <><Check size={12} aria-hidden="true" />Analizzato</> : item.analyzedPages > 0 ? <><Clock3 size={12} aria-hidden="true" />Parzialmente analizzato</> : <><CircleAlert size={12} aria-hidden="true" />Da analizzare</>}</span></span>{item.excludedFromStudy && <span className="material-reference-label">Solo consultazione: escluso da statistiche e calendario</span>}<span className="material-provenance">{item.provenance?.university || ""}</span><span className="material-progress"><span className="material-progress-labels"><span className="material-progress-percent">{item.pages > 0 ? Math.round(Math.min(item.readPages || 0, item.pages) / item.pages * 100) : 0}%</span><span className="material-progress-count"><strong>{item.readPages || 0}</strong><span>/{item.pages}</span></span></span><progress max={item.pages || 1} value={item.readPages || 0} aria-label={`Avanzamento ${item.name}`} /></span></span><ChevronRight size={16} /></Button>
          <DropdownMenu.Root open={openMenuId === item.id} onOpenChange={open => setOpenMenuId(open ? item.id : null)} modal={tourMenuId !== item.id}><DropdownMenu.Trigger asChild><Button variant="ghost" size="icon" className="material-more" aria-label={`Azioni ${item.name.replace(/\.pdf$/i, "")}`} disabled={busy || saving || analysisRunning}><MoreHorizontal size={18} /></Button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content data-tour-material-menu={tourMenuId === item.id ? "true" : undefined} className="material-menu-content" align="end" sideOffset={5} onInteractOutside={event => { if (tourMenuId === item.id && event.detail.originalEvent.target instanceof Element && event.detail.originalEvent.target.closest("[data-tony-tour-panel]")) event.preventDefault(); }} onCloseAutoFocus={event => { if (tourMenuId === item.id) event.preventDefault(); closeMenuFocus(event); }}>{items(item, false)}</DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
        </div></ContextMenu.Trigger>
        <ContextMenu.Portal><ContextMenu.Content className="material-menu-content" onCloseAutoFocus={closeMenuFocus}>{items(item, true)}</ContextMenu.Content></ContextMenu.Portal>
      </ContextMenu.Root><DocumentQuizzes documentId={item.id} documentName={item.name} pending={pendingQuizzes?.(item.id)} autoOpenQuizId={openQuiz?.documentId === item.id ? openQuiz.quizId : undefined} onAutoOpened={onQuizOpened} /></div>)}
    </div>
    <Dialog.Root open={bulkDeleting} onOpenChange={open => { if (!saving) setBulkDeleting(open); }}><Dialog.Portal><Dialog.Overlay className="plan-overlay" /><Dialog.Content className="plan-dialog" onEscapeKeyDown={event => { if (saving) event.preventDefault(); }} onPointerDownOutside={event => { if (saving) event.preventDefault(); }}>
      <Dialog.Title>Elimina PDF selezionati</Dialog.Title><Dialog.Description>Vuoi eliminare {selection.length} PDF? Verranno eliminati anche i loro appunti, spiegazioni e quiz. L’operazione non è reversibile.</Dialog.Description>
      <ul className="material-delete-selection">{selection.map(id => <li key={id}>{documents.find(document => document.id === id)?.name}</li>)}</ul>
      {error && <p className="plan-error" role="alert">{error}</p>}<div className="plan-form-actions"><Dialog.Close asChild><Button variant="outline" disabled={saving}>Annulla</Button></Dialog.Close><Button variant="destructive" disabled={busy || saving || deletionBlocked || !selection.length} onClick={() => void bulkAction("delete")}>{saving ? "Eliminazione…" : "Elimina PDF selezionati"}</Button></div>
    </Dialog.Content></Dialog.Portal></Dialog.Root>
    <Dialog.Root open={!!deleting} onOpenChange={open => { if (!open && !saving) setDeleting(null); }}><Dialog.Portal><Dialog.Overlay className="plan-overlay" /><Dialog.Content className="plan-dialog" onEscapeKeyDown={event => { if (saving) event.preventDefault(); }} onPointerDownOutside={event => { if (saving) event.preventDefault(); }}>
      <Dialog.Title>Elimina file</Dialog.Title><Dialog.Description>Vuoi eliminare “{deleting?.name}”? Verranno eliminati anche i suoi appunti, le spiegazioni e i quiz collegati. Gli altri PDF del corso resteranno disponibili.</Dialog.Description>
      {error && <p className="plan-error" role="alert">{error}</p>}<div className="plan-form-actions"><Dialog.Close asChild><Button variant="outline" disabled={saving}>Annulla</Button></Dialog.Close><Button variant="destructive" onClick={() => void remove()} disabled={saving || (!!deleting && !!isDocumentBusy?.(deleting.id))}>{saving ? "Eliminazione…" : "Elimina file"}</Button></div>
    </Dialog.Content></Dialog.Portal></Dialog.Root>
    <Dialog.Root open={!!renaming} onOpenChange={open => { if (!open && !saving) setRenaming(null); }}><Dialog.Portal><Dialog.Overlay className="plan-overlay" /><Dialog.Content className="plan-dialog" onEscapeKeyDown={e => { if (saving) e.preventDefault(); }} onPointerDownOutside={e => { if (saving) e.preventDefault(); }} onCloseAutoFocus={e => { e.preventDefault(); document.querySelector<HTMLButtonElement>(`[data-document-id="${lastRenamed.current}"] .material-open`)?.focus(); }}>
      <Dialog.Title>Rinomina materiale</Dialog.Title><Dialog.Description>Scegli un nome per ritrovarlo nell’esame. Il PDF e gli appunti restano collegati.</Dialog.Description><Dialog.Close asChild><Button variant="ghost" size="icon" className="plan-dialog-close" aria-label="Chiudi rinomina" disabled={saving}><X size={18} /></Button></Dialog.Close>
      <form className="plan-form" onSubmit={e => { e.preventDefault(); void rename(); }}><label className="form-field"><span className="form-field-label">Nome del materiale</span><Input value={name} onChange={e => setName(e.target.value)} maxLength={200} placeholder="Es. Lezione 1" disabled={saving} required /></label>{error && <p className="plan-error" role="alert">{error}</p>}<div className="plan-form-actions"><Dialog.Close asChild><Button variant="outline" disabled={saving}>Annulla</Button></Dialog.Close><Button type="submit" disabled={saving || !name.trim()}>{saving ? "Salvataggio…" : "Salva nome"}</Button></div></form>
    </Dialog.Content></Dialog.Portal></Dialog.Root>
  </>;
}
