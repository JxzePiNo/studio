"use client";

import { Maximize, Minus, Plus } from "lucide-react";
import { Button } from "./ui/button";
import styles from "./reader-zoom.module.css";

export function ReaderZoom({ zoom, fitWidth, onZoomChange, onFitWidth }: { zoom: number; fitWidth: boolean; onZoomChange: (value: number) => void; onFitWidth: () => void }) {
  return <div className={styles.toolbar} role="group" aria-label="Zoom del documento">
    <Button variant="ghost" size="icon" aria-label="Riduci zoom" disabled={zoom <= 0.5} onClick={() => onZoomChange(Math.max(0.5, Math.round((zoom - 0.1) * 10) / 10))}><Minus size={16} /></Button>
    <Button variant="ghost" size="sm" className={styles.value} aria-label={`Zoom ${Math.round(zoom * 100)}%, ripristina al 100%`} title="Ripristina al 100%" onClick={() => onZoomChange(1)}>{Math.round(zoom * 100)}%</Button>
    <Button variant="ghost" size="icon" aria-label="Aumenta zoom" disabled={zoom >= 2} onClick={() => onZoomChange(Math.min(2, Math.round((zoom + 0.1) * 10) / 10))}><Plus size={16} /></Button>
    <Button variant="ghost" size="sm" aria-label="Adatta alla larghezza" title="Adatta alla larghezza" aria-pressed={fitWidth && zoom === 1} onClick={onFitWidth}><Maximize size={16} /><span className={styles.label}>Larghezza</span></Button>
  </div>;
}
