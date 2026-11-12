"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "./ui/button";
import type { ReaderDisplay } from "./use-reader-display";

export function ReaderNavigation({ page, total, disabled, onNavigate, display, onVisibilityChange, portrait = false }: { portrait?: boolean; page: number; total: number; disabled?: boolean; onNavigate: (page: number) => void; display: ReaderDisplay; onVisibilityChange: (field: keyof ReaderDisplay, visible: boolean) => void }) {
  const [draft, setDraft] = useState(String(page));
  const [error, setError] = useState("");
  const cancel = useRef(false);
  const rangeId = useId();
  useEffect(() => { setDraft(String(page)); setError(""); }, [page]);
  function jump(value: string) {
    if (cancel.current) { cancel.current = false; return; }
    const target = Number(value);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(target) || target < 1 || target > total) {
      setDraft(String(page)); setError(`Inserisci una pagina da 1 a ${total}.`); return;
    }
    setDraft(String(target)); setError("");
    if (!disabled && target !== page) onNavigate(target);
  }
  if (!display.navigation && !display.hints) return null;
  return <div className={`reader-navigation-footer${portrait ? " is-portrait" : ""}`}>
    {display.navigation && <nav className="reader-navigation-island" aria-label="Sfoglia le slide">
      {!portrait && <button className="reader-dismiss" aria-label="Nascondi frecce per questo PDF" title="Nascondi frecce" onClick={() => onVisibilityChange("navigation", false)}><X size={13} /></button>}
      <Button variant="ghost" size="icon" className="reader-previous" aria-label="Pagina precedente" disabled={disabled || page <= 1} onClick={() => onNavigate(page - 1)}><ChevronLeft size={21} /></Button>
      <span className="reader-navigation-page">{portrait && <button className="reader-dismiss" aria-label="Nascondi frecce per questo PDF" title="Nascondi frecce" onClick={() => onVisibilityChange("navigation", false)}><X size={13} /></button>}<input type="number" inputMode="numeric" enterKeyHint="go" min={1} max={total} value={draft} disabled={disabled} aria-label="Numero della slide" aria-describedby={rangeId} aria-invalid={!!error} title="Inserisci una pagina e premi Invio" style={{ width: `${Math.max(2, String(total).length) + 0.5}ch` }}
        onFocus={event => { cancel.current = false; event.currentTarget.select(); }}
        onChange={event => { setDraft(event.target.value); setError(""); }}
        onBlur={event => jump(event.currentTarget.value)}
        onKeyDown={event => {
          event.stopPropagation();
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
          if (event.key === "Escape") { event.preventDefault(); cancel.current = true; setDraft(String(page)); setError(""); event.currentTarget.blur(); }
        }} /><span>/ {total}</span></span>
      <span id={rangeId} className="sr-only">Pagina da 1 a {total}</span>
      {error && <span className="reader-page-error" role="alert">{error}</span>}
      <Button variant="ghost" size="icon" className="reader-next" aria-label="Pagina successiva" disabled={disabled || page >= total} onClick={() => onNavigate(page + 1)}><ChevronRight size={21} /></Button>
    </nav>}
    {display.hints && !portrait && <div className="reader-navigation-hint"><button className="reader-dismiss" aria-label="Nascondi suggerimenti per questo PDF" title="Nascondi suggerimenti" onClick={() => onVisibilityChange("hints", false)}><X size={13} /></button><span><span className="reader-navigation-keys"><kbd>←</kbd><kbd>→</kbd></span><span>Cambia slide</span></span><span className="reader-navigation-keyboard"><kbd>Spazio</kbd><span>Completa e vai avanti</span></span></div>}
  </div>;
}
