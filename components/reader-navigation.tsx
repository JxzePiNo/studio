"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./ui/button";

export function ReaderNavigation({ page, total, disabled, onNavigate }: { page: number; total: number; disabled?: boolean; onNavigate: (page: number) => void }) {
  return <div className="reader-navigation-footer">
    <nav className="reader-navigation-island" aria-label="Sfoglia le slide">
      <Button variant="ghost" size="icon" aria-label="Pagina precedente" disabled={disabled || page <= 1} onClick={() => onNavigate(page - 1)}><ChevronLeft size={21} /></Button>
      <span className="reader-navigation-page" aria-live="polite"><strong>{page}</strong><span>/ {total}</span></span>
      <Button variant="ghost" size="icon" aria-label="Pagina successiva" disabled={disabled || page >= total} onClick={() => onNavigate(page + 1)}><ChevronRight size={21} /></Button>
    </nav>
    <div className="reader-navigation-hint"><span><span className="reader-navigation-keys"><kbd>←</kbd><kbd>→</kbd></span><span>Cambia slide</span></span><span className="reader-navigation-keyboard"><kbd>Spazio</kbd><span>Completa e vai avanti</span></span></div>
  </div>;
}
