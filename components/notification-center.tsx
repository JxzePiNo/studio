"use client";

import { ActionTooltip } from "@/components/ui/tooltip";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import * as Dialog from "@radix-ui/react-popover";
import { Bell, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { TonyMascot } from "./mascot/tony-mascot";
import styles from "./notification-center.module.css";

function NotificationPreview({ children, expiresAt }: { children: ReactNode; expiresAt?: number }) {
  const [visible, setVisible] = useState(() => expiresAt === undefined || expiresAt > Date.now());
  const [interacting, setInteracting] = useState(false);
  const [resumedAt, setResumedAt] = useState<number>();
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!visible || interacting) return;
    const deadline = resumedAt ?? expiresAt ?? Date.now() + 10_000;
    const timer = window.setTimeout(() => setVisible(false), Math.max(0, deadline - Date.now()));
    return () => window.clearTimeout(timer);
  }, [expiresAt, interacting, resumedAt, visible]);

  return <AnimatePresence>
    {visible && <motion.div
      key="preview"
      initial={{ opacity: 0, x: reducedMotion ? 0 : 8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: reducedMotion ? 0 : 8 }}
      transition={{ duration: reducedMotion ? 0 : 0.2 }}
      onFocusCapture={() => setInteracting(true)}
      onBlurCapture={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setResumedAt(Date.now() + 10_000);
          setInteracting(false);
        }
      }}
    >{children}</motion.div>}
  </AnimatePresence>;
}

export function NotificationCenter({ events, children, previews }: {
  events: string[];
  children: (hide: () => void) => ReactNode;
  previews: { id: string; content: ReactNode; expiresAt?: number }[];
}) {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState<string[]>([]);
  const fingerprint = events.join("\u0000");
  useEffect(() => { const show = () => setOpen(true); window.addEventListener("studio-open-notifications", show); return () => window.removeEventListener("studio-open-notifications", show); }, []);
  useEffect(() => { if (open) setSeen(fingerprint ? fingerprint.split("\u0000") : []); }, [open, fingerprint]);
  const unread = events.filter(event => !seen.includes(event)).length;
  function changeOpen(next: boolean) { if (next) setSeen(events); setOpen(next); }
  return <div><Dialog.Root modal open={open} onOpenChange={changeOpen}>
    <Dialog.Trigger asChild><ActionTooltip label="Notifiche"><button className={styles.bell} aria-label={`Mostra notifiche${unread ? `, ${unread} ${unread === 1 ? "nuova" : "nuove"}` : ""}`}>
      <Bell size={18} aria-hidden="true" />{unread > 0 && <span className={styles.badge} aria-hidden="true">{unread > 99 ? "99+" : unread}</span>}
    </button></ActionTooltip></Dialog.Trigger>
    {!open && unread > 0 && <span className={styles.srOnly} role="status" aria-live="polite">{unread === 1 ? "1 nuova notifica" : `${unread} nuove notifiche`}</span>}
    <Dialog.Portal><Dialog.Content side="bottom" align="center" sideOffset={10} collisionPadding={14} className={styles.dialog} aria-label="Notifiche">
      <header className={styles.heading}><h2>Notifiche</h2><Dialog.Close asChild><button aria-label="Chiudi notifiche"><X size={18} /></button></Dialog.Close></header>
      <section className={styles.tony} aria-label="Tony e le notifiche"><TonyMascot size={86} animated showName={false} /><div className={`${styles.speechBubble} ${styles.speech}`}><strong>Tony del bar</strong><p>{events.length ? "Ecco gli aggiornamenti del tuo studio. Da qui puoi aprirli e riprendere da dove eri rimasto." : "Nessuna notifica qui. Quando ci saranno novità, le troverai in questo spazio."}</p></div></section>
      <section className={styles.content} aria-label="Notifiche">{children(() => changeOpen(false))}</section>
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>
    {previews.length > 0 && typeof document !== "undefined" && createPortal(<div hidden={open} className={styles.previews}>
      {previews.map(preview => <NotificationPreview key={preview.id} expiresAt={preview.expiresAt}>{preview.content}</NotificationPreview>)}
    </div>, document.body)}
  </div>;
}
