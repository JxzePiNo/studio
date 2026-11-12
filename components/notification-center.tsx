"use client";

import { useEffect, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-popover";
import { Bell, X } from "lucide-react";
import { TonyMascot } from "./mascot/tony-mascot";
import styles from "./notification-center.module.css";

export function NotificationCenter({ events, children }: { events: string[]; children: (hide: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState<string[]>([]);
  const fingerprint = events.join("\u0000");
  useEffect(() => { const show = () => setOpen(true); window.addEventListener("studio-open-notifications", show); return () => window.removeEventListener("studio-open-notifications", show); }, []);
  useEffect(() => { if (open) setSeen(fingerprint ? fingerprint.split("\u0000") : []); }, [open, fingerprint]);
  const unread = events.filter(event => !seen.includes(event)).length;
  function changeOpen(next: boolean) { if (next) setSeen(events); setOpen(next); }
  return <Dialog.Root modal open={open} onOpenChange={changeOpen}>
    <Dialog.Trigger asChild><button className={styles.bell} aria-label={`Mostra notifiche${unread ? `, ${unread} ${unread === 1 ? "nuova" : "nuove"}` : ""}`} title="Notifiche">
      <Bell size={18} aria-hidden="true" />{unread > 0 && <span className={styles.badge} aria-hidden="true">{unread > 99 ? "99+" : unread}</span>}
    </button></Dialog.Trigger>
    {!open && unread > 0 && <span className={styles.srOnly} role="status" aria-live="polite">{unread === 1 ? "1 nuova notifica" : `${unread} nuove notifiche`}</span>}
    <Dialog.Portal><Dialog.Content side="bottom" align="center" sideOffset={10} collisionPadding={14} className={styles.dialog} aria-label="Notifiche">
      <header className={styles.heading}><h2>Notifiche</h2><Dialog.Close asChild><button aria-label="Chiudi notifiche"><X size={18} /></button></Dialog.Close></header>
      <section className={styles.tony} aria-label="Tony e le notifiche"><TonyMascot size={86} animated showName={false} /><div className={styles.speech}><strong>Tony del bar</strong><p>{events.length ? "Ecco gli aggiornamenti del tuo studio. Da qui puoi aprirli e riprendere da dove eri rimasto." : "Nessuna notifica qui. Quando ci saranno novità, le troverai in questo spazio."}</p></div></section>
      <section className={styles.content} aria-label="Notifiche">{children(() => changeOpen(false))}</section>
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}
