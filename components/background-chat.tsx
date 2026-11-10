"use client";

import { useEffect, useRef, useState } from "react";
import { Check, MessageCircle, X } from "lucide-react";
import { authHeaders } from "@/lib/firebase-client";
import { readApiResponse } from "@/lib/api-response";
import type { ChatMessage } from "@/lib/types";
import styles from "./background-chat.module.css";

import type { QuizConfig } from "@/lib/quiz";

type ChatRequest = { id: string; page: number; name: string; question: string; scope: "document" | "slide"; quiz?: QuizConfig };
export type BackgroundChatSession = { status: "pending" | "completed" | "error"; question: string; messages?: ChatMessage[]; error?: string; revision: number };
type ChatNotification = { key: string; id: string; page: number; name: string; error?: string };
export const chatSessionKey = (id: string, page: number) => `${id}:${page}`;

export function useBackgroundChat({ onSaved }: { onSaved: (id: string, page: number, messages: ChatMessage[]) => void }) {
  const [sessions, setSessions] = useState<Record<string, BackgroundChatSession>>({});
  const [notifications, setNotifications] = useState<ChatNotification[]>([]);
  const requests = useRef(new Map<string, AbortController>());
  const mounted = useRef(true);
  const sequence = useRef(0);
  const savedCallback = useRef(onSaved);
  savedCallback.current = onSaved;
  useEffect(() => {
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<{ documentId: string; quizId?: string; title?: string; deleted?: boolean }>).detail;
      if (!detail?.quizId) return;
      setSessions(current => Object.fromEntries(Object.entries(current).map(([key, value]) => [key, !key.startsWith(`${detail.documentId}:`) ? value : {
        ...value, messages: value.messages?.map((message): ChatMessage => { const quiz = message.quiz; if (!quiz || quiz.id !== detail.quizId) return message; return detail.deleted ? { role: "assistant", content: "Quiz eliminato." } : { ...message, content: `Quiz pronto: ${detail.title}`, quiz: { ...quiz, title: detail.title || quiz.title } }; }),
      }])));
    };
    window.addEventListener("studio-quizzes-changed", changed);
    return () => window.removeEventListener("studio-quizzes-changed", changed);
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const request of requests.current.values()) request.abort();
      requests.current.clear();
    };
  }, []);

  async function send(input: ChatRequest) {
    const key = chatSessionKey(input.id, input.page);
    if (requests.current.has(key)) return false;
    const controller = new AbortController();
    requests.current.set(key, controller);
    const revision = ++sequence.current;
    setSessions(current => ({ ...current, [key]: { ...current[key], status: "pending", question: input.question, error: undefined, revision } }));
    setNotifications(current => current.filter(item => chatSessionKey(item.id, item.page) !== key));
    try {
      const response = await fetch(`/api/documents/${input.id}/chat`, {
        method: "POST", headers: { "Content-Type": "application/json", ...await authHeaders() },
        body: JSON.stringify({ page: input.page, question: input.question, scope: input.scope, ...(input.quiz ? { quiz: input.quiz } : {}) }), signal: controller.signal,
      });
      const messages = await readApiResponse<ChatMessage[]>(response, "Invio non riuscito.");
      if (!mounted.current || controller.signal.aborted) return false;
      setSessions(current => ({ ...current, [key]: { status: "completed", question: input.question, messages, revision } }));
      savedCallback.current(input.id, input.page, messages);
      setNotifications(current => [...current, { key: `${key}:${revision}`, id: input.id, page: input.page, name: input.name }]);
      return true;
    } catch (cause) {
      if (!mounted.current || controller.signal.aborted) return false;
      const error = cause instanceof Error ? cause.message : "Invio non riuscito. Riprova.";
      setSessions(current => ({ ...current, [key]: { ...current[key], status: "error", question: input.question, error, revision } }));
      setNotifications(current => [...current, { key: `${key}:${revision}`, id: input.id, page: input.page, name: input.name, error }]);
      return false;
    } finally {
      if (requests.current.get(key) === controller) requests.current.delete(key);
    }
  }
  function dismissNotification(key: string) { setNotifications(current => current.filter(item => item.key !== key)); }
  return { sessions, notifications, send, dismissNotification, pending: Object.values(sessions).some(session => session.status === "pending") };
}

export type BackgroundChatController = ReturnType<typeof useBackgroundChat>;

export function ChatNotifications({ controller, onOpen }: { controller: BackgroundChatController; onOpen: (id: string, page: number) => void }) {
  if (!controller.notifications.length) return null;
  return <div className={styles.notifications} aria-label="Notifiche del tutor">
    {controller.notifications.map(notification => <div key={notification.key} className={styles.notification} role="status">
      <span className={styles.icon}>{notification.error ? <MessageCircle size={17} /> : <Check size={17} />}</span>
      <button className={styles.open} onClick={() => { controller.dismissNotification(notification.key); onOpen(notification.id, notification.page); }}>
        <strong>{notification.error ? "Il tutor richiede attenzione" : "La risposta è pronta"}</strong>
        <span>{notification.name} · Pagina {notification.page}</span>
      </button>
      <button className={styles.dismiss} onClick={() => controller.dismissNotification(notification.key)} aria-label="Chiudi notifica del tutor"><X size={15} /></button>
    </div>)}
  </div>;
}
