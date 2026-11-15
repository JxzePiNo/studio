"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { MessageCircle, Send, X } from "lucide-react";
import { authHeaders } from "@/lib/firebase-client";
import { readApiResponse } from "@/lib/api-response";
import type { FriendMessage } from "@/lib/friend-messages";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { FriendAvatar } from "./friend-avatar";
import styles from "./friend-messages.module.css";

export type MessageRecipient = FriendMessage["sender"];
export async function messageRequest<T>(body?: unknown, signal?: AbortSignal): Promise<T> {
  return readApiResponse<T>(await fetch("/api/friend-messages", { method: body ? "POST" : "GET", headers: { ...await authHeaders(), ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal, cache: "no-store" }));
}
export function useFriendMessages() {
  const [messages, setMessages] = useState<FriendMessage[]>([]);
  const announced = useRef(new Set<string>());
  const dismissed = useRef(new Set<string>());
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    const load = async () => {
      if (pending || document.visibilityState !== "visible") return;
      pending = true;
      try {
        const result = await messageRequest<{ messages: FriendMessage[] }>(undefined, controller.signal);
        if (controller.signal.aborted) return;
        const incoming = result.messages.filter(message => !dismissed.current.has(message.id));
        setMessages(incoming);
        if (incoming.some(message => !announced.current.has(message.id))) {
          incoming.forEach(message => announced.current.add(message.id));
          window.dispatchEvent(new Event("studio-open-notifications"));
        }
      } catch { /* Retry when the tab is visible or the connection returns. */ }
      finally { pending = false; }
    };
    void load();
    const timer = setInterval(() => void load(), 5000);
    const refresh = () => { void load(); };
    window.addEventListener("online", refresh);
    window.addEventListener("studio-friends-changed", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener("online", refresh); window.removeEventListener("studio-friends-changed", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  const dismiss = useCallback(async (id: string) => {
    if (dismissed.current.has(id)) return;
    dismissed.current.add(id); setError("");
    try { await messageRequest({ action: "read", ids: [id] }); setMessages(current => current.filter(message => message.id !== id)); }
    catch (cause) { dismissed.current.delete(id); setError((cause as Error).message); }
  }, []);
  return { messages, dismiss, error };
}
export function FriendMessageNotifications({ inbox, onReply }: { inbox: ReturnType<typeof useFriendMessages>; onReply: () => void }) {
  return <>{inbox.error && <p role="alert">{inbox.error}</p>}{inbox.messages.map(message => <article key={message.id} className={styles.message} aria-label={`Messaggio da ${message.sender.nickname || message.sender.name}`}>
    <header><FriendAvatar name={message.sender.name} photoURL={message.sender.photoURL} /><div><strong>{message.sender.nickname ? `@${message.sender.nickname}` : message.sender.name}</strong><time dateTime={new Date(message.sentAt).toISOString()}>{new Date(message.sentAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</time></div><Button variant="ghost" size="icon" aria-label={`Segna come letto il messaggio di ${message.sender.nickname || message.sender.name}`} onClick={() => void inbox.dismiss(message.id)}><X size={16} /></Button></header>
    <p>{message.text}</p><Button variant="ghost" size="sm" onClick={() => { onReply(); window.dispatchEvent(new CustomEvent("studio-message-friend", { detail: message.sender })); void inbox.dismiss(message.id); }}><MessageCircle size={15} /> Rispondi</Button>
  </article>)}</>;
}
export function FriendMessageComposer({ recipient, onClose }: { recipient: MessageRecipient; onClose: () => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState(""), [sent, setSent] = useState(false), [busy, setBusy] = useState(false);
  const pending = useRef(false), messageId = useRef(crypto.randomUUID());
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const name = recipient.nickname ? `@${recipient.nickname}` : recipient.name;
  return <Dialog.Root open onOpenChange={open => { if (!open && !pending.current) onClose(); }}><Dialog.Portal><Dialog.Overlay className="account-profile-overlay" /><Dialog.Content className={`account-profile-dialog ${styles.composer}`} onEscapeKeyDown={event => { if (pending.current) event.preventDefault(); }}>
    <Dialog.Title>Messaggio a {name}</Dialog.Title><Dialog.Description>Scrivi un messaggio rapido al tuo amico online. Riceverà una notifica con il tuo username.</Dialog.Description>
    <form onSubmit={async event => {
      event.preventDefault(); if (pending.current || !text.trim()) return;
      pending.current = true; setBusy(true); setError(""); setSent(false);
      try { await messageRequest({ action: "send", id: messageId.current, targetId: recipient.id, text: text.trim() }); if (mounted.current) { setText(""); setSent(true); messageId.current = crypto.randomUUID(); } }
      catch (cause) { if (mounted.current) setError((cause as Error).message); }
      finally { pending.current = false; if (mounted.current) setBusy(false); }
    }}><label htmlFor="friend-message-text">Messaggio</label><Textarea id="friend-message-text" value={text} onChange={event => { setText(event.target.value); setSent(false); messageId.current = crypto.randomUUID(); }} maxLength={2000} rows={4} disabled={busy} required placeholder="Scrivi un messaggio…" />
    {error && <p role="alert">{error}</p>}{sent && <p role="status">Messaggio inviato.</p>}<footer><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Chiudi</Button><Button type="submit" disabled={busy || !text.trim()}><Send size={15} />{busy ? "Invio…" : "Invia messaggio"}</Button></footer></form>
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
