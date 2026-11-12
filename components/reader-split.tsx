"use client";

import { Children, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";
import { MobileReaderTony } from "./mobile-reader-tony";

type Sizes = { desktop: number; mobile: number };
const defaults: Sizes = { desktop: 0.46, mobile: 0.6 };
const storageKey = "studio-reader-split";

export function ReaderSplit({ children }: { children: ReactNode }) {
  const panels = Children.toArray(children);
  const [sizes, setSizes] = useState<Sizes>(defaults);
  const [mobile, setMobile] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [ready, setReady] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const pointer = useRef<number | null>(null);
  const start = useRef({ x: 0, y: 0 });
  const moved = useRef(false);
  const previous = useRef<Sizes>({ ...defaults });
  const chatId = useId();
  const axis = mobile ? "mobile" : "desktop";
  const fraction = mobile ? mobileChatOpen ? 0.5 : 0 : sizes.desktop;
  const collapsed = fraction === 0;

  useEffect(() => {
    const media = window.matchMedia("(max-width: 700px)");
    const update = () => setMobile(media.matches);
    update(); media.addEventListener("change", update);
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (saved && ["desktop", "mobile"].every(key => typeof saved[key] === "number" && Number.isFinite(saved[key]) && saved[key] >= 0 && saved[key] <= 0.8)) {
        setSizes({ desktop: saved.desktop, mobile: saved.mobile });
        previous.current = { desktop: saved.desktop || defaults.desktop, mobile: saved.mobile || defaults.mobile };
      }
    } catch {}
    setReady(true);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!ready || dragging) return;
    try { localStorage.setItem(storageKey, JSON.stringify(sizes)); } catch {}
  }, [sizes, ready, dragging]);

  useEffect(() => {
    if (!mobile) return;
    const update = () => container.current?.style.setProperty("--reader-height", `${window.visualViewport?.height || innerHeight}px`);
    update();
    window.visualViewport?.addEventListener("resize", update);
    window.addEventListener("resize", update);
    return () => { window.visualViewport?.removeEventListener("resize", update); window.removeEventListener("resize", update); container.current?.style.removeProperty("--reader-height"); };
  }, [mobile]);

  function change(next: number) {
    if (mobile) { setMobileChatOpen(next > 0); return; }
    if (next > 0) previous.current[axis] = next;
    setSizes(current => ({ ...current, [axis]: next }));
  }
  function resize(pixels: number) {
    const bounds = container.current?.getBoundingClientRect();
    if (!bounds) return;
    const total = mobile ? bounds.height : bounds.width;
    if (!total) return;
    const maximum = Math.max(0, Math.min(total * (mobile ? 0.8 : 0.7), total - (mobile ? 160 : 280) - 20));
    const minimum = Math.min(mobile ? 180 : 320, maximum);
    change(pixels < (mobile ? 90 : 140) ? 0 : Math.min(maximum, Math.max(minimum, pixels)) / total);
  }
  function toggle() {
    if (mobile) { setMobileChatOpen(value => !value); return; }
    if (!collapsed) change(0);
    else {
      const bounds = container.current?.getBoundingClientRect();
      if (bounds) resize(previous.current[axis] * (mobile ? bounds.height : bounds.width));
    }
  }
  function finish() { pointer.current = null; setDragging(false); }
  const Icon = mobile ? collapsed ? ChevronUp : ChevronDown : collapsed ? ChevronLeft : ChevronRight;

  return <div ref={container} className={`study-grid reader-split${collapsed ? " chat-collapsed" : ""}${dragging ? " is-resizing" : ""}${mobileChatOpen ? " mobile-chat-open" : ""}`} style={{ "--desktop-chat-size": `${sizes.desktop * 100}%`, "--mobile-chat-size": "50%" } as CSSProperties}>
    {panels[0]}
    <div className="reader-splitter" role="separator" tabIndex={0} aria-label="Ridimensiona chat" aria-orientation={mobile ? "horizontal" : "vertical"} aria-controls={chatId} aria-valuemin={0} aria-valuemax={mobile ? 80 : 70} aria-valuenow={Math.round(fraction * 100)} aria-valuetext={collapsed ? "Chat chiusa" : `Chat al ${Math.round(fraction * 100)}%`} title="Trascina per ridimensionare la chat. Doppio clic per aprirla o chiuderla."
      onDoubleClick={event => { if (!(event.target as HTMLElement).closest("button")) toggle(); }}
      onPointerDown={event => {
        if (event.button !== 0) return;
        event.preventDefault();
        const target = (event.target as HTMLElement).closest("button") || event.currentTarget;
        target.setPointerCapture(event.pointerId);
        pointer.current = event.pointerId;
        start.current = { x: event.clientX, y: event.clientY }; moved.current = false;
      }}
      onPointerMove={event => {
        if (pointer.current !== event.pointerId) return;
        if (!moved.current && Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) < 4) return;
        moved.current = true; setDragging(true);
        const bounds = container.current?.getBoundingClientRect();
        if (bounds) resize(mobile ? bounds.bottom - event.clientY - 10 : bounds.right - event.clientX - 10);
      }}
      onPointerUp={event => { finish(); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
      onPointerCancel={finish} onLostPointerCapture={finish}
      onKeyDown={event => {
        if ((event.target as HTMLElement).closest("button")) return;
        const decrease = mobile ? "ArrowDown" : "ArrowRight";
        const increase = mobile ? "ArrowUp" : "ArrowLeft";
        if (![decrease, increase, "Home", "End", "Enter", " "].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        if (event.key === "Home") change(0);
        else if (event.key === "Enter" || event.key === " ") toggle();
        else {
          const bounds = container.current?.getBoundingClientRect();
          if (bounds) {
            const total = mobile ? bounds.height : bounds.width;
            resize(event.key === "End" ? total : fraction * total + (event.key === increase ? 48 : -48));
          }
        }
      }}>
      <span className="reader-splitter-line" aria-hidden="true" />
      <button type="button" className="reader-splitter-toggle" aria-label={collapsed ? "Apri chat" : "Chiudi chat"} aria-expanded={!collapsed} aria-controls={chatId} onClick={event => { if (!moved.current || event.detail === 0) toggle(); moved.current = false; }}><Icon size={14} aria-hidden="true" /></button>
    </div>
    <div id={chatId} className="reader-chat-slot" hidden={collapsed}>{panels[1]}</div>
    {mobile && <MobileReaderTony open={mobileChatOpen} onToggle={toggle} controls={chatId} />}
  </div>;
}
