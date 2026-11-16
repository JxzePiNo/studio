"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Reply, X } from "lucide-react";
import { ActionTooltip } from "./ui/tooltip";
import { authHeaders } from "@/lib/firebase-client";
import { readApiResponse } from "@/lib/api-response";
import type { FriendMessage } from "@/lib/friend-messages";
import { Button } from "./ui/button";
import { FriendAvatar } from "./friend-avatar";
import styles from "./friend-messages.module.css";

export async function messageRequest<T>(body?: unknown, signal?: AbortSignal, friendId?: string): Promise<T> {
  return readApiResponse<T>(await fetch(`/api/friend-messages${friendId ? `?friend=${encodeURIComponent(friendId)}` : ""}`, { method: body ? "POST" : "GET", headers: { ...await authHeaders(), ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal, cache: "no-store" }));
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
          if (window.location.pathname !== "/chat") window.dispatchEvent(new Event("studio-open-notifications"));
        }
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
export function FriendMessageNotifications({ inbox, onReply }: { inbox: ReturnType<typeof useFriendMessages>; onReply: () => void }) {
  return <>{inbox.error && <p role="alert">{inbox.error}</p>}{inbox.messages.map(message => <article key={message.id} className={styles.message} aria-label={`Messaggio da ${message.sender.nickname || message.sender.name}`}>
    <header><FriendAvatar name={message.sender.name} photoURL={message.sender.photoURL} /><div><strong>{message.sender.nickname ? `@${message.sender.nickname}` : message.sender.name}</strong><time dateTime={new Date(message.sentAt).toISOString()}>{new Date(message.sentAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</time></div><ActionTooltip label="Rispondi"><Button className={styles.notificationAction} variant="ghost" size="icon" aria-label="Rispondi" onClick={() => { onReply(); window.dispatchEvent(new CustomEvent("studio-message-friend", { detail: message.sender })); }}><Reply size={15} /></Button></ActionTooltip><ActionTooltip label="Segna come letto"><Button className={styles.notificationAction} variant="ghost" size="icon" aria-label={`Segna come letto il messaggio di ${message.sender.nickname || message.sender.name}`} onClick={() => void inbox.dismiss(message.id)}><X size={15} /></Button></ActionTooltip></header>
    <p>{message.text}</p>
  </article>)}</>;
}
