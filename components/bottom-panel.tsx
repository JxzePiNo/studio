"use client";

import { useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

const collapsedHeight = 32;

export function BottomPanel({ children }: { children: ReactNode }) {
  const [height, setHeight] = useState(collapsedHeight);
  const [dragging, setDragging] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; height: number } | null>(null);
  const previousHeight = useRef(170);
  const collapsed = height <= collapsedHeight;
  const maxHeight = () => Math.max(100, Math.min(420, (panel.current?.parentElement?.clientHeight || 700) * 0.55));
  const resize = (next: number) => setHeight(Math.max(collapsedHeight, Math.min(maxHeight(), next)));
  function toggle() {
    if (collapsed) resize(previousHeight.current);
    else { previousHeight.current = height; setHeight(collapsedHeight); }
  }

  return <div ref={panel} className={`bottom-panel ${collapsed ? "is-collapsed" : ""} ${dragging ? "is-dragging" : ""}`} style={{ height }}>
    <div className="bottom-panel-handle">
      <div className="bottom-panel-grip" role="separator" aria-label="Ridimensiona pannello inferiore" aria-orientation="horizontal" aria-valuemin={collapsedHeight} aria-valuemax={420} aria-valuenow={Math.round(height)} tabIndex={0}
        onDoubleClick={toggle}
        onPointerDown={event => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { y: event.clientY, height };
          setDragging(true);
        }}
        onPointerMove={event => { if (drag.current) resize(drag.current.height - (event.clientY - drag.current.y)); }}
        onPointerUp={event => {
          drag.current = null; setDragging(false);
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onLostPointerCapture={() => { drag.current = null; setDragging(false); }}
        onPointerCancel={() => { drag.current = null; setDragging(false); }}
        onKeyDown={event => {
          if (!["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(event.key)) return;
          event.preventDefault();
          if (event.key === "ArrowDown") resize(height - 24);
          else if (event.key === "ArrowUp") resize(height + 24);
          else if (event.key === "Home") setHeight(collapsedHeight);
          else if (event.key === "End") resize(maxHeight());
          else toggle();
        }}><span /><small>{collapsed ? "Controlli e traduzioni" : "Trascina per ridimensionare"}</small></div>
      <button onClick={toggle} aria-label={collapsed ? "Mostra pannello inferiore" : "Abbassa pannello inferiore"} aria-expanded={!collapsed} aria-controls="reader-bottom-content" title={collapsed ? "Mostra controlli e traduzioni" : "Abbassa per ingrandire il PDF"}>{collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>
    </div>
    <div id="reader-bottom-content" className="bottom-panel-content" hidden={collapsed}>{children}</div>
  </div>;
}
