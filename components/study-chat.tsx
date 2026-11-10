"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowUp, FileText, LoaderCircle, Settings2, Sparkles } from "lucide-react";
import { authHeaders } from "@/lib/firebase-client";
import type { ChatMessage, Explanation } from "@/lib/types";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { MarkdownContent } from "./markdown-content";
import { ExplanationMessage } from "./explanation-message";

interface AnalysisProgress {
  completed: number;
  total: number;
  current?: number | null;
  status: string;
}

export interface StudyChatProps {
  id: string;
  page: number;
  folder?: string;
  initial: ChatMessage[];
  explanation?: Explanation;
  onAnalyze?: () => void;
  onAnalyzeAll?: () => void;
  analyzing?: boolean;
  batchRunning?: boolean;
  configured?: boolean;
  disabled?: boolean;
  onSaved: (messages: ChatMessage[]) => void;
  analysisProgress?: AnalysisProgress;
  onStopAnalysis?: () => void;
  onSettings?: () => void;
}

function BatchProgress({ progress, running, onStop }: { progress?: AnalysisProgress; running: boolean; onStop?: () => void }) {
  const stopping = progress?.status === "stopping";
  const message = stopping ? "Completo la pagina in corso, poi mi fermo." : progress?.status === "completed" ? "Analisi completata" : progress?.status === "stopped" ? "Analisi interrotta. Puoi riprendere quando vuoi." : progress?.status === "error" ? "Analisi sospesa per un errore" : progress?.current ? `Analisi della pagina ${progress.current} di ${progress.total}` : "Analisi del PDF in corso…";
  return <div className="chat-analysis-progress" aria-live="polite">
    <div><span>{message}</span>{progress && <strong>{progress.completed} / {progress.total} pagine pronte</strong>}</div>
    {progress && <progress max={progress.total || 1} value={progress.completed} aria-label="Pagine analizzate" />}
    {running && onStop && <Button variant="ghost" size="sm" disabled={stopping} onClick={onStop}>{stopping ? "Interruzione richiesta…" : "Interrompi analisi"}</Button>}
  </div>;
}

export function StudyChat({ id, page, initial, explanation, onAnalyze, onAnalyzeAll, analyzing = false, batchRunning = false, configured = true, disabled = false, onSaved, analysisProgress, onStopAnalysis, onSettings }: StudyChatProps) {
  const [question, setQuestion] = useState("");
  const [wholeDocument, setWholeDocument] = useState(false);
  const [messages, setMessages] = useState(initial);
  const [pendingQuestion, setPendingQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [scrollRequest, setScrollRequest] = useState(0);
  const lock = useRef(false);
  const composing = useRef(false);
  const mounted = useRef(true);
  const request = useRef<AbortController | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const scrollArea = useRef<HTMLDivElement>(null);
  const scopeHintId = useId();
  const errorId = useId();
  const conversation = messages.filter(message => message.source !== "analysis");
  const canSend = !busy && !disabled && configured && !!question.trim();
  const showProgress = batchRunning || !!analysisProgress;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; request.current?.abort(); };
  }, []);

  useEffect(() => {
    const field = textarea.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, 160)}px`;
    field.style.overflowY = field.scrollHeight > 160 ? "auto" : "hidden";
  }, [question]);

  useEffect(() => {
    // Opening a slide starts at the top of its explanation, even when lengthy.
    if (!scrollRequest) return;
    const area = scrollArea.current;
    if (area) area.scrollTo({ top: area.scrollHeight, behavior: "smooth" });
  }, [scrollRequest]);

  async function send(prompt?: string) {
    if (lock.current || busy || disabled || !configured || !(prompt || question).trim()) return;
    const submittedQuestion = (prompt || question).trim().slice(0, 4000);
    lock.current = true;
    setBusy(true); setError(""); setPendingQuestion(submittedQuestion);
    setScrollRequest(value => value + 1);
    const controller = new AbortController();
    request.current = controller;
    try {
      const response = await fetch(`/api/documents/${id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...await authHeaders() },
        body: JSON.stringify({ question: submittedQuestion, scope: wholeDocument ? "document" : "slide", page }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Invio non riuscito.");
      if (!mounted.current) return;
      setMessages(result); onSaved(result); setQuestion("");
      setPendingQuestion(""); setScrollRequest(value => value + 1);
    } catch (cause) {
      if (!mounted.current || controller.signal.aborted) return;
      setPendingQuestion("");
      setError(cause instanceof Error ? cause.message : "Invio non riuscito. Riprova.");
    } finally {
      lock.current = false;
      if (mounted.current) {
        setBusy(false);
        requestAnimationFrame(() => { if (mounted.current) textarea.current?.focus({ preventScroll: true }); });
      }
      if (request.current === controller) request.current = null;
    }
  }

  return <section className="chat-pane" aria-label={`Chat sulla slide ${page}`}>
    <header className="chat-reader-header">
      <span className="chat-slide-label">Slide {page}</span>
      <div className="chat-reader-actions">
        <Button variant="outline" size="sm" className="chat-mode-toggle" aria-pressed={wholeDocument} aria-describedby={scopeHintId} disabled={busy || disabled} onClick={() => setWholeDocument(value => !value)}><FileText size={15} /> Tutto PDF</Button>
        {onSettings && <Button variant="outline" size="icon" className="chat-reader-settings" aria-label="Impostazioni della lettura" onClick={onSettings}><Settings2 size={17} /></Button>}
      </div>
    </header>
    <div className="chat-scroll-area" ref={scrollArea}>
      <p className="chat-scope-hint" id={scopeHintId} aria-live="polite">{wholeDocument ? "Le domande riguardano tutto il PDF corrente." : "Le domande riguardano questa slide."}</p>
      <div className="chat-messages">
        {explanation ? <ExplanationMessage explanation={explanation} page={page} disabled={busy || disabled || !configured} onDeepen={topic => void send(`Spiega in modo piu approfondito questo argomento della slide: ${topic}. Aggiungi i passaggi intermedi e un esempio concreto.`)} /> : <div className="chat-analysis-empty">
          <span className="chat-analysis-icon"><Sparkles size={25} strokeWidth={1.6} /></span>
          <h2>Partiamo da questa pagina.</h2>
          <p>Una spiegazione completa per capire i concetti. Poi puoi approfondirli con il tutor.</p>
          <div className="chat-analysis-actions">
            <Button disabled={busy || disabled || analyzing || batchRunning || !configured || !onAnalyze} onClick={onAnalyze}>{analyzing && !batchRunning ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />} Analizza questa pagina</Button>
            <Button variant="outline" disabled={busy || disabled || analyzing || batchRunning || !configured || !onAnalyzeAll} onClick={onAnalyzeAll}>Analizza tutto</Button>
          </div>
          {analyzing && !batchRunning && <p role="status">Analisi di questa pagina in corso…</p>}
          {!configured && <p className="chat-analysis-configure">Configura OpenAI dalle impostazioni della lettura per iniziare.</p>}
        </div>}
        <div className="chat-conversation" aria-live="polite" aria-relevant="additions text">
          {conversation.map((message, index) => <article className={`chat-message ${message.role}`} key={`conversation-${index}`}><strong>{message.role === "user" ? "Tu" : "Tutor"}</strong>{message.role === "assistant" ? <MarkdownContent>{message.content}</MarkdownContent> : <p>{message.content}</p>}{message.role === "assistant" && <Button variant="ghost" size="sm" className="deepen-button" disabled={busy || disabled || !configured} onClick={() => void send(`Approfondisci questa spiegazione con passaggi ed esempi: ${message.content.slice(0, 2800)}`)}><Sparkles size={14} /> Approfondisci</Button>}</article>)}
          {pendingQuestion && <article className="chat-message user is-pending"><strong>Tu</strong><p>{pendingQuestion}</p></article>}
          {busy && <p className="chat-thinking" role="status"><LoaderCircle className="spin" size={15} aria-hidden="true" /> Sto approfondendo il materiale…</p>}
        </div>
      </div>
    </div>
    <div className="chat-composer-area">
      {showProgress && <BatchProgress progress={analysisProgress} running={batchRunning} onStop={onStopAnalysis} />}
      {error && <p className="chat-error" id={errorId} role="alert">{error}</p>}
      <form className="chat-composer" onSubmit={event => { event.preventDefault(); void send(); }}>
        <Textarea ref={textarea} className="chat-composer-textarea" aria-label="Domanda al tutor" aria-describedby={error ? errorId : undefined} value={question} onChange={event => setQuestion(event.target.value)} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onKeyDown={event => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && !composing.current && event.nativeEvent.keyCode !== 229) {
            event.preventDefault(); void send();
          }
        }} maxLength={4000} rows={1} placeholder={wholeDocument ? "Fai una domanda sul PDF…" : "Fai una domanda su questa pagina…"} disabled={busy || disabled || !configured} required />
        <Button type="submit" size="icon" className="chat-send" aria-label="Invia domanda" disabled={!canSend}>{busy ? <LoaderCircle size={18} className="spin" aria-hidden="true" /> : <ArrowUp size={20} aria-hidden="true" />}</Button>
      </form>
      <small className="chat-composer-note">Il tutor può commettere errori. Verifica i passaggi importanti.</small>
    </div>
  </section>;
}
