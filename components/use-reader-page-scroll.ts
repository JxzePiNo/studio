"use client";
import { useEffect, useRef, type RefObject } from "react";

/** Scroll a zoomed page normally; turn pages only at its vertical boundary. */
export function useReaderPageScroll(viewer: RefObject<HTMLElement | null>, documentId: string | undefined, page: number, total: number, onNavigate: (page: number) => void, disabled: boolean) {
  const lastChange = useRef(-Infinity);
  useEffect(() => { lastChange.current = -Infinity; }, [documentId]);
  useEffect(() => {
    const element = viewer.current;
    if (!element || !documentId || disabled) return;
    let accumulated = 0; let lastWheel = 0;
    let touch: { x: number; y: number; top: boolean; bottom: boolean } | null = null;
    const canScroll = (direction: number) => direction > 0 ? element.scrollTop + element.clientHeight < element.scrollHeight - 2 : element.scrollTop > 2;
    const turn = (direction: number) => {
      if (Date.now() - lastChange.current < 600) return;
      const next = page + direction;
      if (next < 1 || next > total) return;
      lastChange.current = Date.now(); onNavigate(next);
    };
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || !event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      const direction = Math.sign(event.deltaY);
      if (canScroll(direction)) { accumulated = 0; return; }
      if (event.cancelable) event.preventDefault();
      const now = Date.now();
      if (now - lastWheel > 180 || Math.sign(accumulated) !== direction) accumulated = 0;
      lastWheel = now;
      accumulated += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1);
      if (Math.abs(accumulated) >= 80) { accumulated = 0; turn(direction); }
    };
    const start = (event: TouchEvent) => {
      if (event.touches.length !== 1) { touch = null; return; }
      touch = { x: event.touches[0].clientX, y: event.touches[0].clientY, top: !canScroll(-1), bottom: !canScroll(1) };
    };
    const move = (event: TouchEvent) => {
      if (!touch || event.touches.length !== 1) { touch = null; return; }
      const dx = event.touches[0].clientX - touch.x; const dy = event.touches[0].clientY - touch.y;
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx) * 1.2 && (dy < 0 ? touch.bottom : touch.top) && !canScroll(dy < 0 ? 1 : -1) && event.cancelable) event.preventDefault();
    };
    const end = (event: TouchEvent) => {
      const from = touch; touch = null;
      if (!from || event.touches.length || !event.changedTouches[0]) return;
      const dx = event.changedTouches[0].clientX - from.x; const dy = event.changedTouches[0].clientY - from.y;
      const direction = dy < 0 ? 1 : -1;
      if (Math.abs(dy) >= 70 && Math.abs(dy) > Math.abs(dx) * 1.2 && (direction > 0 ? from.bottom : from.top) && !canScroll(direction)) turn(direction);
    };
    const cancel = () => { touch = null; };
    element.addEventListener("wheel", wheel, { passive: false });
    element.addEventListener("touchstart", start, { passive: true }); element.addEventListener("touchmove", move, { passive: false }); element.addEventListener("touchend", end); element.addEventListener("touchcancel", cancel);
    return () => { element.removeEventListener("wheel", wheel); element.removeEventListener("touchstart", start); element.removeEventListener("touchmove", move); element.removeEventListener("touchend", end); element.removeEventListener("touchcancel", cancel); };
  }, [viewer, documentId, page, total, onNavigate, disabled]);
}
