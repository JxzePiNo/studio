"use client";

import { Check, FileText, Maximize, Minimize, Minus, MoveDiagonal, Plus, Scan, Settings2 } from "lucide-react";
import { Button, type ButtonProps } from "./ui/button";
import { ActionTooltip } from "./ui/tooltip";
import { ReaderNavigation } from "./reader-navigation";

function ToolbarButton({ hint, ...props }: ButtonProps & { hint: string }) {
  return <ActionTooltip label={hint}><Button {...props} /></ActionTooltip>;
}

export function ReaderToolbar({ name, page, total, zoom, autoFit, portrait, pdfOnly, disabled, onZoom, onAutoFit, onNavigate, onPdfOnly, onClean, onSettings, onComplete }: {
  name: string; page: number; total: number; zoom: number; autoFit: boolean; portrait: boolean; pdfOnly: boolean; disabled: boolean;
  onZoom: (value: number) => void; onAutoFit: () => void; onNavigate: (page: number) => void; onPdfOnly: () => void; onClean: () => void; onSettings: () => void; onComplete: () => void;
}) {
  return <div className="reader-toolbar" role="toolbar" aria-label="Comandi del PDF">
    <ActionTooltip label={name}><span className="reader-toolbar-name"><FileText size={16} /><span>{name.replace(/\.pdf$/i, "")}</span></span></ActionTooltip>
    <div className="reader-toolbar-zoom" role="group" aria-label="Zoom del documento">
      <ToolbarButton hint="Riduci lo zoom" variant="ghost" size="icon" aria-label="Riduci zoom" disabled={zoom <= 0.5} onClick={() => onZoom(Math.max(0.5, Math.round((zoom - 0.1) * 10) / 10))}><Minus size={16} /></ToolbarButton>
      <ToolbarButton hint={"Ripristina lo zoom al 100%"} variant="ghost" size="sm" aria-label={`Zoom ${Math.round(zoom * 100)}%, ripristina al 100%`} onClick={() => onZoom(1)}>{Math.round(zoom * 100)}%</ToolbarButton>
      <ToolbarButton hint={"Aumenta lo zoom"} variant="ghost" size="icon" aria-label="Aumenta zoom" disabled={zoom >= 2} onClick={() => onZoom(Math.min(2, Math.round((zoom + 0.1) * 10) / 10))}><Plus size={16} /></ToolbarButton>
      <ToolbarButton hint={portrait ? "Adatta il PDF alla larghezza" : "Adatta il PDF all'altezza"} variant="ghost" size="sm" aria-label="Adatta automaticamente il PDF" aria-pressed={autoFit} onClick={onAutoFit}><Scan size={16} /><span className="reader-toolbar-fit">Auto</span></ToolbarButton>
    </div>
    <ReaderNavigation page={page} total={total} disabled={disabled} onNavigate={onNavigate} display={{ navigation: true, hints: false }} onVisibilityChange={() => {}} />
    <div className="reader-toolbar-views">
      <ToolbarButton data-tour="complete-page" hint={"Completa la slide e vai avanti"} variant="ghost" size="icon" aria-label="Completa la slide e vai avanti" disabled={disabled} onClick={onComplete}><Check size={17} /></ToolbarButton>
      <ToolbarButton hint={pdfOnly ? "Mostra PDF e chat affiancati" : "Espandi il PDF e nascondi la chat"} variant="ghost" size="icon" aria-label={pdfOnly ? "Mostra PDF e chat" : "Ingrandisci PDF"} aria-pressed={pdfOnly} onClick={onPdfOnly}>{pdfOnly ? <Minimize size={17} /> : <Maximize size={17} />}</ToolbarButton>
      <ToolbarButton hint={"Espandi la lettura: PDF e chat senza controlli"} variant="ghost" size="icon" aria-label="Espandi la lettura: PDF e chat senza controlli" onClick={onClean}><MoveDiagonal size={17} /></ToolbarButton>
      <ToolbarButton hint={"Personalizza le impostazioni della lettura"} variant="ghost" size="icon" aria-label="Impostazioni della lettura" onClick={onSettings}><Settings2 size={17} /></ToolbarButton>
    </div>
  </div>;
}
