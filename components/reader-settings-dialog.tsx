"use client";

import { useId, type CSSProperties } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, RotateCcw, Sparkles, X } from "lucide-react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import type { ReaderDisplay } from "./use-reader-display";
import styles from "./reader-settings-dialog.module.css";

interface ReaderSettingsDialogProps {
  display: ReaderDisplay;
  onVisibilityChange: (field: keyof ReaderDisplay, visible: boolean) => void;
  zoom: number;
  onZoomChange: (value: number) => void;
  textSize: number;
  onTextSizeChange: (value: number) => void;
  configured: boolean;
  name: string;
  page: number;
  notes: string;
  noteStatus: string;
  onNotesChange: (notes: string) => void;
  hasExplanation: boolean;
  disabled: boolean;
  onRegenerate: () => void;
  onResetZoom: () => void;
  onClose: () => void;
}

export function ReaderSettingsDialog({ display, onVisibilityChange, zoom, onZoomChange, textSize, onTextSizeChange, configured, name, page, notes, noteStatus, onNotesChange, hasExplanation, disabled, onRegenerate, onResetZoom, onClose }: ReaderSettingsDialogProps) {
  const id = useId();
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="plan-overlay" />
      <Dialog.Content className={`plan-dialog ${styles.shell}`}>
        <Dialog.Close asChild><Button variant="ghost" size="icon" className="plan-dialog-close" aria-label="Chiudi impostazioni"><X size={18} /></Button></Dialog.Close>
        <Dialog.Title>Impostazioni della lettura</Dialog.Title>
        <Dialog.Description className={styles.description}><span title={name}>{name}</span><span className={styles.page}>Slide {page}</span></Dialog.Description>

        <div className={`plan-form ${styles.form}`}>
          <section className={styles.section} aria-labelledby={`${id}-display`}>
            <h3 id={`${id}-display`}>Visualizzazione</h3>
            <div className={styles.fields}>
              <div className="form-field">
                <label className={`form-field-label ${styles.fieldLabel}`} htmlFor={`${id}-zoom`}>Zoom del PDF <span className={styles.value}>{Math.round(zoom * 100)}%</span></label>
                <input className={styles.range} style={{ "--range-fill": `${(zoom - 0.5) / 1.5 * 100}%` } as CSSProperties} id={`${id}-zoom`} aria-label="Zoom del PDF" type="range" min="0.5" max="2" step="0.1" value={zoom} onChange={event => onZoomChange(Number(event.target.value))} />
                <Button variant="ghost" size="sm" className={styles.reset} aria-label="Ripristina zoom" onClick={onResetZoom}><RotateCcw size={12} /> Ripristina al 100%</Button>
              </div>
              <div className="form-field">
                <label className={`form-field-label ${styles.fieldLabel}`} htmlFor={`${id}-size`}>Dimensione del testo <span className={styles.value}>{textSize} px</span></label>
                <input className={styles.range} style={{ "--range-fill": `${(textSize - 14) / 8 * 100}%` } as CSSProperties} id={`${id}-size`} aria-label="Dimensione del testo" type="range" min="14" max="22" step="1" value={textSize} onChange={event => onTextSizeChange(Number(event.target.value))} />
                <small className={styles.help}>Per spiegazioni e messaggi della chat.</small>
              </div>
            </div>
          </section>

          <section className={styles.section} aria-labelledby={`${id}-controls`}>
            <h3 id={`${id}-controls`}>Comandi del PDF</h3>
            <div className={styles.options}>
              <label className={`${styles.option} reader-display-option`}><span>Mostra frecce di navigazione</span><input type="checkbox" role="switch" checked={display.navigation} onChange={event => onVisibilityChange("navigation", event.target.checked)} /></label>
              <label className={`${styles.option} reader-display-option`}><span>Mostra suggerimenti dei comandi</span><input type="checkbox" role="switch" checked={display.hints} onChange={event => onVisibilityChange("hints", event.target.checked)} /></label>
            </div>
          </section>

          <section className={styles.section} aria-labelledby={`${id}-notebook`}>
            <div className="form-field">
              <label id={`${id}-notebook`} className="form-field-label" htmlFor={`${id}-notes`}>Appunti personali</label>
              <Textarea id={`${id}-notes`} className={styles.notes} aria-label={`Appunti della slide ${page}`} value={notes} onChange={event => onNotesChange(event.target.value)} maxLength={50000} placeholder="Collegamenti, formule e idee da ricordare…" />
              <p className={styles.saveStatus} role="status"><Check size={13} aria-hidden="true" />{noteStatus}</p>
            </div>
          </section>

          {hasExplanation && <section className={styles.tools} aria-label="Analisi della pagina"><div><h3>Analisi della pagina</h3><p>{configured ? "Genera una nuova spiegazione per questa slide." : "La rigenerazione non è disponibile in questo momento."}</p></div><Button variant="outline" disabled={disabled || !configured} onClick={onRegenerate} aria-label="Rigenera analisi della pagina"><Sparkles size={15} /> Rigenera</Button></section>}

          <div className={styles.footer}><span>Le modifiche si applicano subito.</span><Dialog.Close asChild><Button>Chiudi</Button></Dialog.Close></div>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
