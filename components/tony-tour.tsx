"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { tonyTours, tourLabels, type TonyTourStep, type TourSection } from "@/lib/tony-tours";
import { positionTourPanel } from "@/lib/tour-position";
import { useTonyTours } from "./tony-tour-provider";
import { TonyMascot } from "./mascot/tony-mascot";
import { Button } from "./ui/button";
import styles from "./tony-tour.module.css";

function findTarget(selector: string) {
  return [...document.querySelectorAll<HTMLElement>(selector)].find(element => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== "hidden" && !element.closest('[hidden]');
  });
}
function prepareStep(step: TonyTourStep) {
  if (step.prepare === "material-menu") {
    const trigger = findTarget(".material-more");
    const id = trigger?.closest<HTMLElement>("[data-document-id]")?.dataset.documentId;
    trigger?.scrollIntoView({ block: "center", behavior: "instant" });
    if (id) window.dispatchEvent(new CustomEvent("studio-tour-material-menu", { detail: { open: true, id } }));
    return () => { window.dispatchEvent(new CustomEvent("studio-tour-material-menu", { detail: { open: false } })); };
  }
  if (step.prepare === "material-open") window.dispatchEvent(new CustomEvent("studio-tour-material-menu", { detail: { open: false } }));
  if (step.prepare) {
    const toggle = document.querySelector<HTMLButtonElement>('.reader-splitter-toggle[aria-expanded="false"]');
    if (step.prepare === "chat") toggle?.click();
    if (step.prepare === "glossary") document.querySelector<HTMLButtonElement>('.bottom-panel.is-collapsed .bottom-panel-handle button')?.click();
  }
}
type ActiveTour = { section: TourSection; scope: string; steps: TonyTourStep[] };
type Layout = { left: number; top: number; hole: { left: number; top: number; width: number; height: number } | null };

export function TonyTour({ section, scope, ready, eligible }: { section: TourSection | null; scope: string; ready: boolean; eligible: boolean }) {
  const { seen, loading, error, requested, consumeRequest, markSeen } = useTonyTours();
  const [active, setActive] = useState<ActiveTour | null>(null);
  const [index, setIndex] = useState(0), [missing, setMissing] = useState(false);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [suspended, setSuspended] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const step = active?.steps[index];
  const finish = useCallback(() => {
    if (!active) return;
    void markSeen(active.section);
    consumeRequest(); setActive(null); setIndex(0); setLayout(null);
  }, [active, consumeRequest, markSeen]);

  useEffect(() => {
    if (active && (active.section !== section || active.scope !== scope || !eligible)) { setActive(null); setLayout(null); }
  }, [section, scope, eligible, active]);
  useEffect(() => {
    if (active || !section || !ready || !eligible || loading || (error && !requested) || (requested ? requested !== section : seen[section])) return;
    const start = () => {
      // Wait for onboarding, account, welcome and notification panels to close.
      if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [data-tony-tour-panel]')) return;
      if (section === "reader" && !findTarget('.slide-stage > .pdf-canvas[data-ready="true"]')) return;
      const steps = tonyTours[section].filter(item => !item.optional || findTarget(item.target));
      if (!steps.length || !findTarget(steps[0].prepare === "material-menu" ? ".material-more" : steps[0].target)) return;
      setIndex(0); setLayout(null); setMissing(false); setActive({ section, scope, steps });
      consumeRequest();
    };
    const delay = setTimeout(start, 500);
    const retry = setInterval(start, 500);
    return () => { clearTimeout(delay); clearInterval(retry); };
  }, [active, section, scope, ready, eligible, loading, error, seen, requested, consumeRequest]);

  useEffect(() => {
    if (!active || suspended) return;
    document.body.dataset.tonyTour = "true";
    return () => { delete document.body.dataset.tonyTour; };
  }, [active, suspended]);
  useEffect(() => {
    if (!active) { setSuspended(false); return; }
    const check = () => setSuspended(!!document.querySelector('[role="dialog"][data-state="open"]:not([data-tony-tour-panel]), [role="alertdialog"][data-state="open"]'));
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-state"] });
    check();
    return () => observer.disconnect();
  }, [active]);
  useEffect(() => {
    if (!step) return;
    setMissing(false);
    const cleanUpStep = prepareStep(step);
    const focusTimer = step.prepare === "material-menu" ? setTimeout(() => panel.current?.focus({ preventScroll: true }), 50) : undefined;
    let frame = 0, target: HTMLElement | undefined, positioned = false;
    const started = performance.now();
    const track = () => {
      if (!target?.isConnected || !target.getBoundingClientRect().width) target = findTarget(step.target);
      if (target && !positioned) { target.scrollIntoView({ block: "nearest", inline: "center", behavior: "instant" }); positioned = true; }
      const rect = target?.getBoundingClientRect();
      const width = innerWidth, height = innerHeight;
      const hole = rect ? { left: Math.max(4, rect.left - 6), top: Math.max(4, rect.top - 6), width: Math.max(0, Math.min(width - 4, rect.right + 6) - Math.max(4, rect.left - 6)), height: Math.max(0, Math.min(height - 4, rect.bottom + 6) - Math.max(4, rect.top - 6)) } : null;
      const bounds = panel.current?.getBoundingClientRect();
      const menu = step.prepare === "material-menu" ? document.querySelector<HTMLElement>("[data-tour-material-menu]")?.getBoundingClientRect() : null;
      const position = positionTourPanel(menu || hole, { width: bounds?.width || Math.min(430, width - 24), height: bounds?.height || 230 }, { width, height });
      const next = { ...position, hole };
      setLayout(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
      if (!target && performance.now() - started > 1800) setMissing(true);
      else if (target) setMissing(false);
      frame = requestAnimationFrame(track);
    };
    frame = requestAnimationFrame(track);
    return () => { cancelAnimationFrame(frame); clearTimeout(focusTimer); cleanUpStep?.(); };
  }, [step]);
  useEffect(() => {
    if (step?.action !== "open-pdf") return;
    const target = findTarget(step.target);
    target?.addEventListener("click", finish, { capture: true });
    return () => target?.removeEventListener("click", finish, { capture: true });
  }, [step, finish]);

  return <Dialog.Root modal={false} open={!!active && !suspended} onOpenChange={open => { if (!open) finish(); }}><Dialog.Portal>
    {layout?.hole && <div className={styles.ring} aria-hidden="true" data-tour-highlight={step?.id} style={{ left: layout.hole.left, top: layout.hole.top, width: layout.hole.width, height: layout.hole.height }} />}
    <Dialog.Content ref={panel} className={styles.scene} data-tony-tour-panel data-tour-section={active?.section} data-tour-step={step?.id} style={layout ? { left: layout.left, top: layout.top } : { left: 12, bottom: 12 }} onOpenAutoFocus={event => { event.preventDefault(); panel.current?.focus(); }} onInteractOutside={event => event.preventDefault()} onEscapeKeyDown={event => { event.preventDefault(); finish(); }}>
      <div className={styles.tony} aria-hidden="true"><TonyMascot size="100%" animated showName={false} mood="happy" /></div>
      <div className={styles.speech}>
        <header><Dialog.Title>Tour {active ? tourLabels[active.section] : ""}</Dialog.Title><button type="button" aria-label="Salta tour" onClick={finish}><X size={17} /></button></header>
        <span className={styles.counter}>Tony del bar · {index + 1} di {active?.steps.length || 0}</span>
        <h3>{step?.title}</h3><Dialog.Description aria-live="polite">{step?.text}</Dialog.Description>
        {missing && <p className={styles.missing} role="status">Questo controllo non è visibile in questa vista. Puoi proseguire con il tour.</p>}
        <footer><Button variant="ghost" size="sm" disabled={index === 0} onClick={() => { setIndex(value => value - 1); }}><ArrowLeft size={14} /> Indietro</Button><Button size="sm" onClick={() => { if (step?.action === "open-pdf") { findTarget(step.target)?.click(); } else if (active && index === active.steps.length - 1) finish(); else { setIndex(value => value + 1); } }}>{step?.action === "open-pdf" ? "Apri PDF" : active && index === active.steps.length - 1 ? "Finito!" : "Avanti"}<ArrowRight size={14} /></Button></footer>
        <button className={styles.skip} type="button" onClick={finish}>Salta il tour · puoi rifarlo dall’account</button>
      </div>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
