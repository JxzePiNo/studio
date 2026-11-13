"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { BookOpen, LoaderCircle, X } from "lucide-react";
import { authHeaders, browserAuth, firebaseEnabled } from "@/lib/firebase-client";
import { readApiResponse } from "@/lib/api-response";
import { SelectionNotesContext, type SelectionNote } from "@/lib/selection-notes-context";
import { MarkdownContent } from "./markdown-content";
import styles from "./selection-notes.module.css";

export function SelectionNotes({ documentId, page, disabled, children }: { documentId: string; page: number; disabled?: boolean; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [notes, setNotes] = useState<SelectionNote[]>([]);
  const [ready, setReady] = useState(false);
  const storageKey = useRef("");
  const notesRef = useRef(notes); notesRef.current = notes;
  const [selection, setSelection] = useState<{ term: string; source: string; context: string; x: number; y: number } | null>(null);
  const [activeId, setActiveId] = useState("");
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const active = notes.find(note => note.id === activeId);

  useEffect(() => {
    const owner = firebaseEnabled ? browserAuth().currentUser?.uid : "local";
    if (owner) {
      storageKey.current = `studio-term-notes:${owner}:${documentId}:${page}`;
      try {
        const saved: unknown = JSON.parse(sessionStorage.getItem(storageKey.current) || "[]");
        if (Array.isArray(saved)) setNotes(saved.filter((note): note is SelectionNote =>
          note && typeof note.id === "string" && typeof note.source === "string" && typeof note.term === "string" && note.term.length > 0 && note.term.length <= 160 && typeof note.context === "string" && note.context.length <= 6000 && (note.explanation === undefined || typeof note.explanation === "string")
        ).slice(-30));
      } catch { /* Optional local notes never prevent reading. */ }
    }
    setReady(true);
  }, [documentId, page]);
  useEffect(() => {
    if (ready && storageKey.current) try { sessionStorage.setItem(storageKey.current, JSON.stringify(notes)); } catch { /* Session storage may be unavailable. */ }
  }, [notes, ready]);

  useEffect(() => {
    const changed = () => {
      const selected = window.getSelection();
      if (disabled || !selected || selected.isCollapsed || !selected.rangeCount) { setSelection(null); return; }
      const range = selected.getRangeAt(0);
      const element = range.startContainer.parentElement?.closest<HTMLElement>("[data-note-source]");
      const term = selected.toString().trim();
      if (!element || !root.current?.contains(element) || !element.contains(range.endContainer) || !term || term.length > 160 || range.startContainer.parentElement?.closest("pre,code,.katex, a")) { setSelection(null); return; }
      const box = range.getBoundingClientRect();
      const paragraph = range.startContainer.parentElement?.closest("p,li,td,th,h1,h2,h3,h4,blockquote");
      const text = (paragraph && element.contains(paragraph) && paragraph.contains(range.endContainer) ? paragraph : element).textContent || "";
      const index = text.indexOf(term);
      const start = Math.max(0, index - 2500);
      setSelection({ term, source: element.dataset.noteSource!, context: text.slice(start, start + 6000), x: Math.max(12, Math.min(window.innerWidth - 190, box.left)), y: Math.max(12, Math.min(window.innerHeight - 54, box.bottom + 8)) });
    };
    document.addEventListener("selectionchange", changed);
    return () => document.removeEventListener("selectionchange", changed);
  }, [disabled]);
  useEffect(() => () => request.current?.abort(), []);

  const open = useCallback((id: string) => { request.current?.abort(); setPending(""); setActiveId(id); setError(""); setSelection(null); }, []);
  async function explain(note: SelectionNote) {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setPending(note.id); setError("");
    try {
      const response = await fetch(`/api/documents/${documentId}/term`, { method: "POST", headers: { "Content-Type": "application/json", ...await authHeaders() }, body: JSON.stringify({ page, term: note.term, context: note.context }), signal: controller.signal });
      const result = await readApiResponse<{ explanation: string }>(response, "Impossibile spiegare il concetto.");
      if (!controller.signal.aborted) setNotes(current => current.map(item => item.id === note.id ? { ...item, explanation: result.explanation } : item));
    } catch (cause) { if (!controller.signal.aborted) setError((cause as Error).message); }
    finally { if (!controller.signal.aborted) setPending(""); }
  }
  function create() {
    if (!selection) return;
    const existing = notesRef.current.find(note => note.source === selection.source && note.term === selection.term);
    const note = existing || { id: crypto.randomUUID(), source: selection.source, term: selection.term, context: selection.context };
    if (!existing) setNotes(current => [...current.slice(-29), note]);
    open(note.id); window.getSelection()?.removeAllRanges();
    if (!note.explanation) void explain(note);
  }

  return <SelectionNotesContext.Provider value={{ notes, open }}>
    <div ref={root} className={styles.root}>{children}</div>
    {selection && <button type="button" className={styles.action} style={{ left: selection.x, top: selection.y }} onPointerDown={event => event.preventDefault()} onClick={create}><BookOpen size={15} /> Spiega la selezione</button>}
    <Dialog.Root open={!!active} onOpenChange={value => { if (!value) { setActiveId(""); setSelection(null); } }}><Dialog.Portal>
      <Dialog.Overlay className={styles.overlay} />
      <Dialog.Content className={styles.note}>
        <header><div><Dialog.Title>{active?.term}</Dialog.Title><Dialog.Description>Chiarimento separato dalla chat e dalla sua memoria.</Dialog.Description></div><Dialog.Close asChild><button type="button" aria-label="Chiudi spiegazione"><X size={19} /></button></Dialog.Close></header>
        <div className={styles.body}>
          {active && pending === active.id && <p role="status"><LoaderCircle size={16} className="spin" /> Sto preparando la spiegazione...</p>}
          {active?.explanation && <MarkdownContent>{active.explanation}</MarkdownContent>}
          {error && <p role="alert">{error}</p>}
          {active && !active.explanation && pending !== active.id && <button type="button" onClick={() => void explain(active)}>Riprova</button>}
        </div>
      </Dialog.Content>
    </Dialog.Portal></Dialog.Root>
  </SelectionNotesContext.Provider>;
}
