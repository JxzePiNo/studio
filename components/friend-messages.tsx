"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Reply, X } from "lucide-react";
import { ActionTooltip } from "./ui/tooltip";
import { authHeaders } from "@/lib/firebase-client";
import { readApiResponse } from "@/lib/api-response";
import type { FriendMessage } from "@/lib/friend-messages";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { FriendAvatar } from "./friend-avatar";
import styles from "./friend-messages.module.css";

export function submitMessageOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
  if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
  event.preventDefault();
  if (!event.repeat && event.currentTarget.value.trim()) event.currentTarget.form?.requestSubmit();
}

export function MessageShortcutHint({ id }: { id: string }) {
  return <small id={id} className={styles.shortcutHint}><kbd>Invio</kbd> per inviare · <kbd>Maiusc + Invio</kbd> per andare a capo</small>;
}

export async function messageRequest<T>(body?: unknown, signal?: AbortSignal, friendId?: string): Promise<T> {
  return readApiResponse<T>(await fetch(`/api/friend-messages${friendId ? `?friend=${encodeURIComponent(friendId)}` : ""}`, { method: body ? "POST" : "GET", headers: { ...await authHeaders(), ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal, cache: "no-store" }));
}
export function useFriendMessages() {
  const [messages, setMessages] = useState<FriendMessage[]>([]);
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
        setMessages(result.messages.filter(message => !dismissed.current.has(message.id)));
      } catch { /* Retry when the tab is visible or the connection returns. */ }
      finally { pending = false; }
    };
    void load();
    const timer = setInterval(() => void load(), 5000);
    const refresh = () => { void load(); };
    window.addEventListener("online", refresh);
    window.addEventListener("studio-friends-changed", refresh);
    window.addEventListener("studio-messages-changed", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener("online", refresh); window.removeEventListener("studio-friends-changed", refresh); window.removeEventListener("studio-messages-changed", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  const dismiss = useCallback(async (id: string) => {
    if (dismissed.current.has(id)) return;
    dismissed.current.add(id); setError("");
    try { await messageRequest({ action: "read", ids: [id] }); setMessages(current => current.filter(message => message.id !== id)); }
    catch (cause) { dismissed.current.delete(id); setError((cause as Error).message); }
  }, []);
  return { messages, dismiss, error };
}
export function FriendMessageNotifications({ inbox }: { inbox: ReturnType<typeof useFriendMessages> }) {
  return <>{inbox.error && <p role="alert">{inbox.error}</p>}{inbox.messages.map(message =>
    <FriendMessageNotification key={message.id} message={message} dismiss={inbox.dismiss} />
  )}</>;
}

export function FriendMessageNotification({ message, dismiss }: { message: FriendMessage; dismiss: (id: string) => Promise<void> }) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const replyId = useRef<string | null>(null);
  const shortcutHintId = useId();
  const senderName = message.sender.nickname || message.sender.name;

  async function sendReply() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError("");
    try {
      replyId.current ??= crypto.randomUUID();
      await messageRequest({ action: "send", id: replyId.current, targetId: message.sender.id, text });
      replyId.current = null;
      setDraft("");
      setReplyOpen(false);
      await dismiss(message.id);
      window.dispatchEvent(new Event("studio-messages-changed"));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSending(false);
    }
  }

  return <article className={styles.message} aria-label={`Messaggio da ${senderName}`}>
    <header>
      <FriendAvatar name={message.sender.name} photoURL={message.sender.photoURL} />
      <div><strong>{message.sender.nickname ? `@${message.sender.nickname}` : message.sender.name}</strong><time dateTime={new Date(message.sentAt).toISOString()}>{new Date(message.sentAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</time></div>
      <ActionTooltip label="Rispondi"><Button type="button" className={styles.notificationAction} variant="ghost" size="icon" aria-label="Rispondi" aria-expanded={replyOpen} disabled={sending} onClick={() => setReplyOpen(open => !open)}><Reply size={15} /></Button></ActionTooltip>
      <ActionTooltip label="Segna come letto"><Button type="button" className={styles.notificationAction} variant="ghost" size="icon" aria-label={`Segna come letto il messaggio di ${senderName}`} disabled={sending} onClick={() => void dismiss(message.id)}><X size={15} /></Button></ActionTooltip>
    </header>
    <p>{message.text}</p>
    {replyOpen && <form className={styles.quickReply} onSubmit={event => { event.preventDefault(); void sendReply(); }}>
      <Textarea autoFocus aria-label={`Risposta a ${senderName}`} aria-describedby={shortcutHintId} onKeyDown={submitMessageOnEnter} placeholder="Scrivi una risposta…" rows={2} maxLength={2000} value={draft} disabled={sending} onChange={event => {
        setDraft(event.target.value);
        replyId.current = null;
      }} />
      <Button type="submit" size="sm" disabled={sending || !draft.trim()}>{sending ? "Invio…" : "Invia"}</Button>
      <MessageShortcutHint id={shortcutHintId} />
      {error && <p role="alert">{error}</p>}
    </form>}
  </article>;
}
