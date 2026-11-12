"use client";
import { invalidateApiCache } from "@/lib/browser-data-cache";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, MessageCircle, X } from "lucide-react";
import { authHeaders, browserAuth, firebaseEnabled } from "@/lib/firebase-client";
import { studyArtifactSchema, type StudyArtifact } from "@/lib/study-artifact";
import type { StudyDocument } from "@/lib/types";
import { readChatStream } from "@/lib/chat-stream";
import { readApiResponse } from "@/lib/api-response";
import type { ChatMessage } from "@/lib/types";
import styles from "./background-chat.module.css";

import type { QuizConfig, StudyQuiz } from "@/lib/quiz";

type ChatRequest = { id: string; page: number; name: string; question: string; scope: "document" | "slide" | "studied"; quiz?: QuizConfig; quizIntent?: boolean; visualization?: boolean; artifactKind?: import("@/lib/study-artifact").ArtifactKind };
export type BackgroundChatSession = { status: "pending" | "completed" | "error"; question: string; messages?: ChatMessage[]; streamingText?: string; error?: string; revision: number; kind?: "chat" | "quiz" | "visualization"; documentId?: string; request?: ChatRequest };
type ChatNotification = { key: string; id: string; page: number; name: string; error?: string; quizId?: string; kind?: "chat" | "quiz" | "visualization" };
export const chatSessionKey = (id: string, page: number) => `${id}:${page}`;
export type GeneratedMaterial = { documentId: string; page: number; name: string; artifact: StudyArtifact };

export function useBackgroundChat({ onSaved, onQuizStarted }: { onSaved: (id: string, page: number, messages: ChatMessage[]) => void; onQuizStarted?: (id: string) => void }) {
  const [sessions, setSessions] = useState<Record<string, BackgroundChatSession>>({});
  const [notifications, setNotifications] = useState<ChatNotification[]>([]);
  const [generations, setGenerations] = useState<GeneratedMaterial[]>([]);
  const [generationsReady, setGenerationsReady] = useState(false);
  const generationStorage = useRef("");
  useEffect(() => {
    const owner = firebaseEnabled ? browserAuth().currentUser?.uid : "local";
    if (!owner) return;
    generationStorage.current = `studio-generations:${owner}`;
    try {
      const saved = JSON.parse(sessionStorage.getItem(generationStorage.current) || "[]");
      if (Array.isArray(saved)) setGenerations(saved.flatMap(item => {
        const artifact = studyArtifactSchema.safeParse(item?.artifact);
        return artifact.success && typeof item.documentId === "string" && typeof item.name === "string" && Number.isInteger(item.page) && item.page > 0 ? [{ ...item, artifact: artifact.data }] : [];
      }));
    } catch { /* A bad cache never blocks studying. */ }
    setGenerationsReady(true);
  }, []);
  useEffect(() => { if (generationsReady && generationStorage.current) try { sessionStorage.setItem(generationStorage.current, JSON.stringify(generations)); } catch {} }, [generations, generationsReady]);
  function rememberMaterials(documentId: string, page: number, name: string, messages: ChatMessage[]) {
    const artifacts = messages.flatMap(message => message.artifact ? [message.artifact] : []);
    setGenerations(previous => [...artifacts.reverse().map(artifact => ({ documentId, page, name: name || previous.find(item => item.artifact.id === artifact.id)?.name || "PDF", artifact })), ...previous.filter(item => item.documentId !== documentId || item.page !== page)]);
  }
  const requests = useRef(new Map<string, AbortController>());
  const mounted = useRef(true);
  const sequence = useRef(0);
  const savedCallback = useRef(onSaved);
  savedCallback.current = onSaved;
  const quizStartedCallback = useRef(onQuizStarted);
  quizStartedCallback.current = onQuizStarted;
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
    let kind: "quiz" | "chat" | "visualization" = input.quiz ? "quiz" : input.visualization ? "visualization" : "chat";
    setSessions(current => ({ ...current, [key]: { ...current[key], status: "pending", question: input.question, error: undefined, streamingText: "", revision, kind, documentId: input.id, request: input } }));
    setNotifications(current => current.filter(item => chatSessionKey(item.id, item.page) !== key));
    if (kind === "quiz") quizStartedCallback.current?.(input.id);
    try {
      const response = await fetch(`/api/documents/${input.id}/${input.quiz ? "quiz" : input.visualization ? "visualizations" : "chat"}`, {
        method: "POST", headers: { "Content-Type": "application/json", ...(!input.quiz && !input.visualization ? { Accept: "text/event-stream" } : {}), ...await authHeaders() },
        body: JSON.stringify(input.quiz || { page: input.page, question: input.question, scope: input.scope, ...(input.visualization ? { kind: input.artifactKind || "map" } : {}) }), signal: controller.signal,
      });
      let result: ChatMessage[] | StudyQuiz | undefined;
      let streamedQuizId: string | undefined;
      if (response.ok && response.headers.get("Content-Type")?.includes("text/event-stream")) {
        await readChatStream(response, event => {
          if (!mounted.current || controller.signal.aborted) return;
          if (event.event === "delta") setSessions(current => ({ ...current, [key]: { ...current[key], streamingText: (current[key]?.streamingText || "") + event.data.text } }));
          if (event.event === "quiz-start") {
            if (kind !== "quiz") quizStartedCallback.current?.(input.id);
            kind = "quiz";
            setSessions(current => ({ ...current, [key]: { ...current[key], kind: "quiz", streamingText: "" } }));
          }
          if (event.event === "quiz") streamedQuizId = event.data.quizId;
          if (event.event === "done") { result = event.data.messages; streamedQuizId = event.data.quizId || streamedQuizId; }
        });
      } else result = await readApiResponse<ChatMessage[] | StudyQuiz>(response, "Invio non riuscito.");
      if (!mounted.current || controller.signal.aborted) return false;
      const quizId = input.quiz ? (result as StudyQuiz).id : streamedQuizId || response.headers.get("X-Studio-Quiz-Id") || undefined;
      const messages = Array.isArray(result) ? result : undefined;
      if (kind === "quiz" && !quizId) throw new Error(messages?.at(-1)?.content || "La richiesta non ha prodotto un quiz. Riprova dal pulsante Quiz.");
      if (kind === "visualization" && !messages?.at(-1)?.artifact) throw new Error("Il materiale è incompleto. Riprova con una richiesta più circoscritta.");
      setSessions(current => ({ ...current, [key]: { status: "completed", question: input.question, messages, revision, kind: quizId ? "quiz" : kind, documentId: input.id, request: input } }));
      await invalidateApiCache(`/api/documents/${input.id}`, `/api/documents/${input.id}/quiz`);
      if (messages) savedCallback.current(input.id, input.page, messages);
      if (messages) rememberMaterials(input.id, input.page, input.name, messages);
      if (quizId) {
        window.dispatchEvent(new CustomEvent("studio-quizzes-changed", { detail: { documentId: input.id } }));
        if (kind !== "quiz") quizStartedCallback.current?.(input.id);
      }
      setNotifications(current => [...current, { key: `${key}:${revision}`, id: input.id, page: input.page, name: input.name, quizId, kind: quizId ? "quiz" : kind }]);
      return true;
    } catch (cause) {
      if (!mounted.current || controller.signal.aborted) return false;
      const error = cause instanceof Error ? cause.message : "Invio non riuscito. Riprova.";
      setSessions(current => ({ ...current, [key]: { ...current[key], status: "error", question: input.question, error, revision } }));
      setNotifications(current => [...current, { key: `${key}:${revision}`, id: input.id, page: input.page, name: input.name, error, kind }]);
      return false;
    } finally {
      if (requests.current.get(key) === controller) requests.current.delete(key);
    }
  }
  function dismissNotification(key: string) { setNotifications(current => current.filter(item => item.key !== key)); }
  return { sessions, notifications, generations, registerDocumentMaterials: (document: StudyDocument) => { for (const [page, slide] of Object.entries(document.slides)) rememberMaterials(document.id, Number(page), document.name, slide.chat || []); }, send, receiveMessages: (id: string, page: number, messages: ChatMessage[]) => { const key = chatSessionKey(id, page); setSessions(current => current[key] ? { ...current, [key]: { ...current[key], messages } } : current); rememberMaterials(id, page, "", messages); savedCallback.current(id, page, messages); }, dismissNotification, pending: Object.values(sessions).some(session => session.status === "pending"), retry: (key: string) => { const request = sessions[key]?.request; if (request) void send(request); } };
}

export type BackgroundChatController = ReturnType<typeof useBackgroundChat>;

export function ChatNotifications({ controller, onOpen, onOpenQuiz, onHide }: { controller: BackgroundChatController; onOpen: (id: string, page: number) => void; onOpenQuiz?: (id: string, quizId?: string) => void; onHide?: () => void }) {
  const [collapsed, setCollapsed] = useState(false);
  if (!controller.notifications.length) return null;
  return <section className={styles.notifications} aria-label="Notifiche del tutor" data-collapsed={collapsed}>
    <button className={styles.heading} onClick={onHide || (() => setCollapsed(value => !value))} aria-expanded={!collapsed} aria-label={collapsed ? "Espandi notifiche del tutor" : "Riduci notifiche del tutor"}>
      <MessageCircle size={15} aria-hidden="true" /><span>{collapsed ? "Notifiche" : "Notifiche del tutor"}</span><span className={styles.count}>{controller.notifications.length}</span>{collapsed ? <ChevronDown size={17} aria-hidden="true" /> : <ChevronUp size={17} aria-hidden="true" />}
    </button>
    <div className={styles.items} hidden={collapsed}>
      {controller.notifications.map(notification => <div key={notification.key} className={styles.notification} role="status">
        <span className={styles.icon}>{notification.error ? <MessageCircle size={17} /> : <Check size={17} />}</span>
        <button className={styles.open} onClick={() => { controller.dismissNotification(notification.key); if (notification.kind === "quiz") onOpenQuiz?.(notification.id, notification.quizId); else onOpen(notification.id, notification.page); }}>
          <strong>{notification.error ? "Il tutor richiede attenzione" : notification.quizId ? "Il quiz è pronto" : notification.kind === "visualization" ? "Il materiale è pronto" : "La risposta è pronta"}</strong>
          <span>{notification.name} · Pagina {notification.page}</span>
        </button>
        <button className={styles.dismiss} onClick={() => { if (controller.notifications.length === 1) onHide?.(); controller.dismissNotification(notification.key); }} aria-label="Chiudi notifica del tutor"><X size={15} /></button>
      </div>)}
    </div>
  </section>;
}
