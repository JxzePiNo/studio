"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TonyMascot } from "./mascot/tony-mascot";

const key = "studio-mobile-tony-position";
type Position = { x: number; y: number };

export function MobileReaderTony({ open, onToggle, controls }: { open: boolean; onToggle: () => void; controls: string }) {
  const [position, setPosition] = useState<Position | null>(null);
  const [viewportHeight, setViewportHeight] = useState(() => window.visualViewport?.height || innerHeight);
  const button = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const clamp = (value: Position) => {
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft || 0; const top = viewport?.offsetTop || 0;
    return { x: Math.max(left + 8, Math.min(value.x, left + (viewport?.width || innerWidth) - 72)), y: Math.max(top + 8, Math.min(value.y, top + (viewport?.height || innerHeight) - 72)) };
  };
  const save = (value: Position) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
  useEffect(() => {
    try { const saved = JSON.parse(localStorage.getItem(key) || "null"); if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) setPosition(clamp(saved)); } catch {}
    const resize = () => { setViewportHeight(window.visualViewport?.height || innerHeight); setPosition(current => current ? clamp(current) : null); };
    window.addEventListener("resize", resize); window.visualViewport?.addEventListener("resize", resize);
    return () => { window.removeEventListener("resize", resize); window.visualViewport?.removeEventListener("resize", resize); };
  }, []);

  return createPortal(<button ref={button} type="button" className="mobile-reader-tony" data-chat-open={open} style={position ? { left: position.x, top: position.y, right: "auto", bottom: "auto" } : open ? { top: viewportHeight / 2 - 32, bottom: "auto" } : undefined}
    aria-label={open ? "Chiudi chat con Tony" : "Apri chat con Tony"} aria-expanded={open} aria-controls={controls} title="Trascina Tony per spostarlo. Tocca per aprire o chiudere la chat."
    onDragStart={event => event.preventDefault()}
    onPointerDown={event => {
      if (event.button !== 0) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: bounds.left, top: bounds.top, moved: false };
      suppressClick.current = false;
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => {
      const current = drag.current;
      if (!current || current.id !== event.pointerId) return;
      if (!current.moved && Math.hypot(event.clientX - current.x, event.clientY - current.y) < 6) return;
      current.moved = true;
      setPosition(clamp({ x: current.left + event.clientX - current.x, y: current.top + event.clientY - current.y }));
    }}
    onPointerUp={event => {
      if (drag.current?.id !== event.pointerId) return;
      suppressClick.current = drag.current.moved;
      if (drag.current.moved) { const next = clamp({ x: drag.current.left + event.clientX - drag.current.x, y: drag.current.top + event.clientY - drag.current.y }); setPosition(next); save(next); }
      else if (event.pointerType === "touch") { onToggle(); suppressClick.current = true; }
      drag.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }}
    onPointerCancel={() => { drag.current = null; suppressClick.current = true; }}
    onLostPointerCapture={() => { if (drag.current) { suppressClick.current = drag.current.moved; drag.current = null; } }}
    onClick={event => { if (suppressClick.current && (event.detail !== 0 || (event.nativeEvent as PointerEvent).pointerType === "touch")) { suppressClick.current = false; return; } onToggle(); }}
    onKeyDown={event => {
      const steps: Record<string, Position> = { ArrowLeft: { x: -16, y: 0 }, ArrowRight: { x: 16, y: 0 }, ArrowUp: { x: 0, y: -16 }, ArrowDown: { x: 0, y: 16 } };
      const step = steps[event.key]; if (!step) return;
      event.preventDefault(); event.stopPropagation();
      const bounds = button.current!.getBoundingClientRect();
      const next = clamp({ x: bounds.left + step.x, y: bounds.top + step.y }); setPosition(next); save(next);
    }}><TonyMascot size={60} animated={false} showName={false} /></button>, document.body);
}
