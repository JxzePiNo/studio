"use client";

import { Check, FileText, Maximize, Minimize, Minus, Plus, Scan, Settings2, Sparkles } from "lucide-react";
import { Button } from "./ui/button";
import { ReaderNavigation } from "./reader-navigation";

export function ReaderToolbar({ name, page, total, zoom, autoFit, portrait, pdfOnly, disabled, onZoom, onAutoFit, onNavigate, onPdfOnly, onClean, onSettings, onComplete }: {
  name: string; page: number; total: number; zoom: number; autoFit: boolean; portrait: boolean; pdfOnly: boolean; disabled: boolean;
  onZoom: (value: number) => void; onAutoFit: () => void; onNavigate: (page: number) => void; onPdfOnly: () => void; onClean: () => void; onSettings: () => void; onComplete: () => void;
}) {
  return <div className="reader-toolbar" role="toolbar" aria-label="Comandi del PDF">
    <span className="reader-toolbar-name" title={name}><FileText size={16} /><span>{name.replace(/\.pdf$/i, "")}</span></span>
    <div className="reader-toolbar-zoom" role="group" aria-label="Zoom del documento">
      <Button variant="ghost" size="icon" aria-label="Riduci zoom" disabled={zoom <= 0.5} onClick={() => onZoom(Math.max(0.5, Math.round((zoom - 0.1) * 10) / 10))}><Minus size={16} /></Button>
      <Button variant="ghost" size="sm" aria-label={`Zoom ${Math.round(zoom * 100)}%, ripristina al 100%`} onClick={() => onZoom(1)}>{Math.round(zoom * 100)}%</Button>
      <Button variant="ghost" size="icon" aria-label="Aumenta zoom" disabled={zoom >= 2} onClick={() => onZoom(Math.min(2, Math.round((zoom + 0.1) * 10) / 10))}><Plus size={16} /></Button>
      <Button variant="ghost" size="sm" aria-label="Adatta automaticamente il PDF" title={portrait ? "Adatta alla larghezza" : "Adatta all’altezza"} aria-pressed={autoFit} onClick={onAutoFit}><Scan size={16} /><span className="reader-toolbar-fit">Auto</span></Button>
    </div>
    <ReaderNavigation page={page} total={total} disabled={disabled} onNavigate={onNavigate} display={{ navigation: true, hints: false }} onVisibilityChange={() => {}} />
    <div className="reader-toolbar-views">
      <Button variant="ghost" size="icon" aria-label="Completata" title="Completa la slide e vai avanti" disabled={disabled} onClick={onComplete}><Check size={17} /></Button>
      <Button variant="ghost" size="icon" aria-label={pdfOnly ? "Mostra PDF e chat" : "Ingrandisci PDF"} title={pdfOnly ? "Mostra PDF e chat" : "Ingrandisci PDF"} aria-pressed={pdfOnly} onClick={onPdfOnly}>{pdfOnly ? <Minimize size={17} /> : <Maximize size={17} />}</Button>
      <Button variant="ghost" size="icon" aria-label="Pulisci schermata" title="Pulisci schermata: PDF e chat senza controlli" onClick={onClean}><Sparkles size={17} /></Button>
      <Button variant="ghost" size="icon" aria-label="Impostazioni della lettura" title="Impostazioni della lettura" onClick={onSettings}><Settings2 size={17} /></Button>
    </div>
  </div>;
}
