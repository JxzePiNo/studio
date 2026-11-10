"use client";

import { useEffect, useRef } from "react";

export function useAmbientParallax(enabled: boolean) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled) return;
    const preference = window.matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)");
    let frame = 0;
    let x = 0;
    let y = 0;
    const update = () => {
      frame = 0;
      element.style.setProperty("--ambient-x", `${x}px`);
      element.style.setProperty("--ambient-y", `${y}px`);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const reset = () => { x = 0; y = 0; schedule(); };
    const move = (event: PointerEvent) => {
      if (!preference.matches || event.pointerType !== "mouse") return;
      x = (event.clientX / window.innerWidth - 0.5) * -28;
      y = (event.clientY / window.innerHeight - 0.5) * -20;
      schedule();
    };
    window.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", reset);
    window.addEventListener("blur", reset);
    preference.addEventListener("change", reset);
    return () => {
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", reset);
      window.removeEventListener("blur", reset);
      preference.removeEventListener("change", reset);
      cancelAnimationFrame(frame);
      element.style.removeProperty("--ambient-x");
      element.style.removeProperty("--ambient-y");
    };
  }, [enabled]);
  return ref;
}
