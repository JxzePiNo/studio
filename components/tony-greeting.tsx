"use client";
import { useEffect, useRef, useState } from "react";
import { authHeaders } from "@/lib/firebase-client";
import { readApiResponse } from "@/lib/api-response";
import { referralRequest } from "@/lib/referral-client";
import type { ReferralGreeting } from "@/lib/referrals";
import { ChatMessageAuthor } from "./chat-message-author";
import { Button } from "./ui/button";
import styles from "./referrals.module.css";

/** The parent keys this chat by screen: navigation cancels its entire read timer. */
export function TonyGreeting() {
  const [greeting, setGreeting] = useState<ReferralGreeting | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState("");
  const message = useRef<HTMLElement>(null);
  const reading = useRef(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const abort = new AbortController(); controller.current = abort;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/referrals/greetings", { headers: await authHeaders(), signal: abort.signal, cache: "no-store" });
        const data = await readApiResponse<{ greeting: ReferralGreeting | null }>(response);
        if (!abort.signal.aborted) setGreeting(current => current?.id === data.greeting?.id ? current : data.greeting);
      } catch { /* A missed poll must never mark a greeting as read. */ }
    };
    void load();
    const refresh = () => { void load(); };
    const timer = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => { abort.abort(); clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);

  async function markRead() {
    if (!greeting || reading.current || controller.current?.signal.aborted) return;
    reading.current = true; setError("");
    try {
      await referralRequest({ action: "read", greetingId: greeting.id }, controller.current?.signal);
      if (!controller.current?.signal.aborted) setDismissed(true);
    } catch { if (!controller.current?.signal.aborted) setError("Non ho salvato la lettura. Il saluto resterà disponibile."); }
    finally { reading.current = false; }
  }

  useEffect(() => {
    if (!greeting || dismissed || !message.current) return;
    let visible = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const modalOpen = () => !!document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]');
    let obscured = modalOpen();
    const canRead = () => visible && document.visibilityState === "visible" && document.hasFocus() && !modalOpen();
    const update = () => {
      clearTimeout(timer);
      if (canRead()) {
        timer = setTimeout(() => { if (canRead()) void markRead(); }, Math.max(8000, (greeting.text.length + greeting.fromName.length + 35) * 60));
      }
    };
    const observer = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting === true && entries[0].intersectionRatio >= 0.9; update(); }, { threshold: [0, 0.9, 1] });
    observer.observe(message.current);
    const modals = new MutationObserver(() => { const next = modalOpen(); if (obscured !== next) { obscured = next; update(); } });
    modals.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-state"] });
    window.addEventListener("focus", update); window.addEventListener("blur", update); document.addEventListener("visibilitychange", update);
    return () => { clearTimeout(timer); observer.disconnect(); modals.disconnect(); window.removeEventListener("focus", update); window.removeEventListener("blur", update); document.removeEventListener("visibilitychange", update); };
  // Restart only when the displayed greeting changes; polling never resets reading time.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [greeting, dismissed]);

  if (!greeting || dismissed) return null;
  return <section ref={message} className={styles.greeting} aria-label="Un saluto da Tony">
    <ChatMessageAuthor />
    <div className={styles.message} role="status"><p><strong>{greeting.fromName}</strong> mi ha chiesto di portarti un saluto!</p><p>{greeting.text}</p></div>
    <div className={styles.actions}><Button size="sm" onClick={() => void markRead()}>Ho letto</Button><Button variant="ghost" size="sm" onClick={() => setDismissed(true)}>Leggi più tardi</Button></div>
    {error && <p role="alert">{error}</p>}
  </section>;
}
