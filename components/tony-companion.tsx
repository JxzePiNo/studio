"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronRight, LifeBuoy, MousePointer2, X } from "lucide-react";
import { TonyMascot } from "./mascot/tony-mascot";
import styles from "./tony-companion.module.css";

type Context = "home" | "course" | "sessions" | "reader";
type Step = { target: string; text: string };
const tips: Record<Context, string[]> = {
  home: ["Lucido i bicchieri. Tu scegli il prossimo esame!", "Un esame alla volta, come un buon caffè.", "Crea un esame e aggiungi i PDF: al resto pensiamo insieme.", "La griglia dei giorni racconta le pagine che hai studiato."],
  course: ["Preparo uno spritz… tu prepara le slide!", "Puoi analizzare i PDF e continuare a girare per Studio.", "Tasto destro su un file: puoi segnare un intervallo di pagine già lette.", "Anche due esami possono essere analizzati contemporaneamente."],
  sessions: ["Pulisco il bancone e facciamo il conto delle pagine.", "Avvia il timer quando studi: ritroverai qui la sessione.", "Tasto destro sulle sessioni per unirle o eliminarle.", "Clicca un giorno nella griglia per rivedere la tua attività."],
  reader: ["Un caffè e una pagina alla volta.", "Premi Spazio per segnare la pagina come letta o da leggere.", "Dalla chat puoi chiedermi un quiz sugli argomenti del PDF."],
};
const guides: { title: string; hint: string; context: Context; steps: Step[] }[] = [
  { title: "Crea un esame", hint: "Il primo passo per organizzare lo studio", context: "home", steps: [{ target: '[aria-label="Crea esame"]', text: "Premi Crea esame: potrai scegliere nome, data e impostazioni del corso." }] },
  { title: "Trova un esame", hint: "Ricerca e organizzazione dei corsi", context: "home", steps: [{ target: '[aria-label="Cerca un esame"]', text: "Scrivi qui il nome del corso. Apri poi la sua cartella per vedere i materiali." }, { target: '[aria-label="Ordina esami"]', text: "Scegli come ordinare gli esami: per data, nome o creazione." }] },
  { title: "Carica e analizza i PDF", hint: "Dal materiale alle spiegazioni", context: "course", steps: [{ target: '[aria-label="Aggiungi file"]', text: "Trascina i PDF qui oppure premi Scegli i PDF. Il caricamento salva i materiali nel corso." }, { target: '.exam-action-grid > :first-child', text: "Avvia l’analisi da questo pannello. Puoi cambiare schermata mentre Tony lavora." }] },
  { title: "Rivedi le sessioni", hint: "Attività, statistiche e pagine studiate", context: "sessions", steps: [{ target: '[aria-label="Sessioni di studio"]', text: "Qui trovi le statistiche e le sessioni salvate. Clicca un giorno nella griglia per filtrare; usa il tasto destro su una sessione per gestirla." }] },
];

export function TonyCompanion({ context, onNavigate, sidebarSlot }: { context: Context; onNavigate: (context: Context) => boolean; sidebarSlot?: HTMLElement | null }) {
  const [phrase, setPhrase] = useState(0);
  const [muted, setMuted] = useState(false);
  const [help, setHelp] = useState(false);
  const [guide, setGuide] = useState<(typeof guides)[number] | null>(null);
  const [step, setStep] = useState(0);
  const [box, setBox] = useState<DOMRect | null>(null);
  const [missing, setMissing] = useState(false);
  const [notice, setNotice] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const [sidebarFits, setSidebarFits] = useState(false);

  useEffect(() => {
    if (!sidebarSlot) { setSidebarFits(false); return; }
    const desktop = window.matchMedia("(min-width: 701px)");
    const measure = () => {
      const rect = sidebarSlot.getBoundingClientRect();
      setSidebarFits(desktop.matches && rect.width >= 180 && rect.height >= 160);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(sidebarSlot);
    desktop.addEventListener("change", measure);
    measure();
    return () => { observer.disconnect(); desktop.removeEventListener("change", measure); };
  }, [sidebarSlot]);

  useEffect(() => {
    const open = () => { setGuide(null); setHelp(true); setNotice(""); };
    window.addEventListener("studio-help", open);
    return () => window.removeEventListener("studio-help", open);
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setPhrase(value => value + 1), 12000);
    return () => window.clearInterval(timer);
  }, [context]);
  useEffect(() => {
    if (!guide) return;
    let frame = 0;
    let previous = "";
    const started = Date.now();
    const track = () => {
      const target = [...document.querySelectorAll<HTMLElement>(guide.steps[step].target)].find(el => el.getBoundingClientRect().width > 0);
      if (target) {
        if (!previous) target.scrollIntoView({ block: "nearest", behavior: "instant" });
        const rect = target.getBoundingClientRect();
        const key = `${rect.x},${rect.y},${rect.width},${rect.height}`;
        if (key !== previous) { previous = key; setBox(rect); setMissing(false); }
      } else { setBox(null); if (Date.now() - started > 2000) setMissing(true); }
      frame = requestAnimationFrame(track);
    };
    frame = requestAnimationFrame(track);
    panel.current?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setGuide(null); };
    const observer = new MutationObserver(() => {
      if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) setGuide(null);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("keydown", escape);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener("keydown", escape); };
  }, [guide, step]);

  function startGuide(next: (typeof guides)[number]) {
    if (!onNavigate(next.context)) { setNotice("Apri prima un corso per seguire questa guida."); return; }
    setHelp(false); setStep(0); setBox(null); setMissing(false); setGuide(next);
  }

  const inSidebar = !!sidebarSlot && sidebarFits && context === "course";
  const companion = context !== "reader" && <div className={`${styles.lane} ${inSidebar ? styles.sidebarLane : ""}`} data-placement={inSidebar ? "sidebar" : "workspace"}>
      <div className={styles.companion}>
        <button className={styles.mascot} type="button" onClick={() => { setMuted(false); setPhrase(value => value + 1); }} aria-label="Un consiglio da Tony del bar"><TonyMascot size="100%" animated={false} /></button>
        {!muted && <div className={styles.bubble}><p key={`${context}:${phrase}`}>{tips[context][phrase % tips[context].length]}</p><button type="button" aria-label="Nascondi i consigli di Tony" onClick={() => setMuted(true)}><X size={13} /></button></div>}
      </div>
    </div>;
  return <>
    {inSidebar ? createPortal(companion, sidebarSlot!) : companion}
    <Dialog.Root open={help} onOpenChange={setHelp}><Dialog.Portal>
      <Dialog.Overlay className={styles.overlay} />
      <Dialog.Content className={styles.help}>
        <header><img src="/lifebuoy.png" width={30} height={30} alt="" /><div><Dialog.Title>Cosa vuoi fare?</Dialog.Title><Dialog.Description>Scegli una guida: ti mostro dove andare.</Dialog.Description></div><Dialog.Close aria-label="Chiudi le guide"><X size={18} /></Dialog.Close></header>
        <ul>{guides.map(item => <li key={item.title}><button type="button" onClick={() => startGuide(item)}><span><strong>{item.title}</strong><small>{item.hint}</small></span><ChevronRight size={16} /></button></li>)}</ul>
        {notice && <p role="status">{notice}</p>}
      </Dialog.Content>
    </Dialog.Portal></Dialog.Root>
    {guide && <>
      {box && <div className={styles.highlight} style={{ top: box.top - 5, left: box.left - 5, width: box.width + 10, height: box.height + 10 }}><MousePointer2 className={styles.cursor} size={26} /></div>}
      <div ref={panel} tabIndex={-1} role="region" aria-label="Guida interattiva" className={styles.guide}>
        <button className={styles.close} type="button" aria-label="Termina la guida" onClick={() => setGuide(null)}><X size={16} /></button>
        <strong><LifeBuoy size={17} /> {guide.title} <small>{step + 1}/{guide.steps.length}</small></strong>
        <p aria-live="polite">{missing ? "Questo elemento non è disponibile in questa schermata. Puoi chiudere la guida e riprovare." : guide.steps[step].text}</p>
        <button className={styles.next} type="button" onClick={() => { if (step === guide.steps.length - 1) setGuide(null); else { setBox(null); setMissing(false); setStep(value => value + 1); } }}>{step === guide.steps.length - 1 ? "Ho capito" : "Avanti"}<ChevronRight size={15} /></button>
      </div>
    </>}
  </>;
}
