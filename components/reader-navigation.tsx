"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "./ui/button";
import type { ReaderDisplay } from "./use-reader-display";

export function ReaderNavigation({ page, total, disabled, onNavigate, display, onVisibilityChange }: { page: number; total: number; disabled?: boolean; onNavigate: (page: number) => void; display: ReaderDisplay; onVisibilityChange: (field: keyof ReaderDisplay, visible: boolean) => void }) {
  if (!display.navigation && !display.hints) return null;
  return <div className="reader-navigation-footer">
    {display.navigation && <nav className="reader-navigation-island" aria-label="Sfoglia le slide">
      <button className="reader-dismiss" aria-label="Nascondi frecce per questo PDF" title="Nascondi frecce" onClick={() => onVisibilityChange("navigation", false)}><X size={13} /></button>
      <Button variant="ghost" size="icon" aria-label="Pagina precedente" disabled={disabled || page <= 1} onClick={() => onNavigate(page - 1)}><ChevronLeft size={21} /></Button>
      <span className="reader-navigation-page" aria-live="polite"><strong>{page}</strong><span>/ {total}</span></span>
      <Button variant="ghost" size="icon" aria-label="Pagina successiva" disabled={disabled || page >= total} onClick={() => onNavigate(page + 1)}><ChevronRight size={21} /></Button>
    </nav>}
    {display.hints && <div className="reader-navigation-hint"><button className="reader-dismiss" aria-label="Nascondi suggerimenti per questo PDF" title="Nascondi suggerimenti" onClick={() => onVisibilityChange("hints", false)}><X size={13} /></button><span><span className="reader-navigation-keys"><kbd>←</kbd><kbd>→</kbd></span><span>Cambia slide</span></span><span className="reader-navigation-keyboard"><kbd>Spazio</kbd><span>Completa e vai avanti</span></span></div>}
  </div>;
}
