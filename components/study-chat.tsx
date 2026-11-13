"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { browserAuth, firebaseEnabled } from "@/lib/firebase-client";
import { useStudyProfile } from "./study-profile-provider";
import { ChatMessageAuthor } from "./chat-message-author";
import { ClipboardList, ArrowUp, FileText, LoaderCircle, Settings2, Sparkles } from "lucide-react";
import type { ChatMessage, Explanation } from "@/lib/types";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { MarkdownContent } from "./markdown-content";
import { CreationDialog } from "./creation-dialog";
import { StudyArtifactView } from "./study-artifact-view";
import { ConceptModelView } from "./concept-model-view";
import { QuizDialog } from "./quiz-dialog";
import { quizRequestSummary } from "@/lib/quiz";
import { ExplanationMessage } from "./explanation-message";
import { SelectionNotes } from "./selection-notes";
import { chatSessionKey, type BackgroundChatController } from "./background-chat";

interface AnalysisProgress {
  completed: number;
  total: number;
  current?: number | null;
  active?: number[];
  status: string;
}

export interface StudyChatProps {
  id: string;
  controller: BackgroundChatController;
  documentName?: string;
  courseName?: string;
  page: number;
  folder?: string;
  initial: ChatMessage[];
  explanation?: Explanation;
  onAnalyze?: () => void;
  onAnalyzeAll?: () => void;
  analyzing?: boolean;
  batchRunning?: boolean;
  analysisBusy?: boolean;
  configured?: boolean;
  disabled?: boolean;
  analysisProgress?: AnalysisProgress;
  onStopAnalysis?: () => void;
  onSettings?: () => void;
  onNavigatePage?: (page: number) => void;
  onReturnToMap?: () => void;
}

function BatchProgress({ progress, running, onStop }: { progress?: AnalysisProgress; running: boolean; onStop?: () => void }) {
  const stopping = progress?.status === "stopping";
  const message = stopping ? "Completo le pagine in corso, poi mi fermo." : progress?.status === "completed" ? "Analisi completata" : progress?.status === "stopped" ? "Analisi interrotta. Puoi riprendere quando vuoi." : progress?.status === "error" ? "Analisi sospesa per un errore" : progress?.active?.length ? `Analisi delle pagine ${progress.active.join(", ")} di ${progress.total}` : progress?.current ? `Analisi della pagina ${progress.current} di ${progress.total}` : "Analisi del PDF in corso…";
  return <div className="chat-analysis-progress" aria-live="polite">
    <div><span>{message}</span>{progress && <strong>{progress.completed} / {progress.total} pagine pronte</strong>}</div>
    {progress && <progress max={progress.total || 1} value={progress.completed} aria-label="Pagine analizzate" />}
    {running && onStop && <Button variant="ghost" size="sm" disabled={stopping} onClick={onStop}>{stopping ? "Interruzione richiesta…" : "Interrompi analisi"}</Button>}
  </div>;
}

export function StudyChat({ id, controller, documentName = "PDF", courseName, page, initial, explanation, onAnalyze, onAnalyzeAll, analyzing = false, batchRunning = false, analysisBusy = false, configured = true, disabled = false, analysisProgress, onStopAnalysis, onSettings, onNavigatePage, onReturnToMap }: StudyChatProps) {
  const { profile } = useStudyProfile();
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    if (!firebaseEnabled) return;
    return onAuthStateChanged(browserAuth(), setUser);
  }, []);
  const authorName = profile?.displayName?.trim() || user?.displayName || "Tu";
  const session = controller.sessions[chatSessionKey(id, page)];
  const [question, setQuestion] = useState(() => session?.status === "error" ? session.question : "");
  const [quizDialog, setQuizDialog] = useState(false);
  const [modelDialog, setModelDialog] = useState(false);
  const [wholeDocument, setWholeDocument] = useState(false);
  const messages = session?.messages || initial;
  const busy = session?.status === "pending";
  const pendingQuestion = busy || session?.streamingText ? session?.question : "";
  const error = session?.error || "";
  const [scrollRequest, setScrollRequest] = useState(0);
  const lock = useRef(false);
  const composing = useRef(false);
  const mounted = useRef(true);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const scrollArea = useRef<HTMLDivElement>(null);
  const readingPosition = useRef(0);
  const wasPending = useRef(busy);
  const questionInputId = useId();
  const scopeHintId = useId();
  const errorId = useId();
  const conversation = messages.filter(message => message.source !== "analysis");
  const canSend = !busy && !disabled && configured && !!question.trim();
  const showProgress = batchRunning || !!analysisProgress;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
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

  useLayoutEffect(() => {
    // Saving replaces the streaming article. Keep the reader's position through
    // that replacement instead of jumping to the end of the saved answer.
    if (wasPending.current && !busy && scrollArea.current) {
      scrollArea.current.scrollTop = readingPosition.current;
    }
    wasPending.current = busy;
  }, [busy]);

  async function send(prompt?: string) {
    if (lock.current || busy || disabled || !configured || !(prompt || question).trim()) return;
    const submittedQuestion = (prompt || question).trim().slice(0, 4000);
    lock.current = true;
    setScrollRequest(value => value + 1);
    try {
      const quizIntent = /^\s*(?:puoi\s+|mi\s+|per favore\s+)*(?:genera\w*|crea\w*|fammi|prepara\w*|vorrei|voglio)\b[\s\S]{0,100}\bquiz\b/i.test(submittedQuestion) || /^\s*(?:un\s+)?quiz\b/i.test(submittedQuestion);
      const success = await controller.send({ id, page, name: documentName, question: submittedQuestion, scope: wholeDocument ? "document" : "slide", quizIntent });
      if (!mounted.current) return;
      if (success) setQuestion("");
    } finally {
      lock.current = false;
    }
  }

  return <section className="chat-pane" aria-label={`Chat sulla slide ${page}`}>
    {quizDialog && <QuizDialog courseName={courseName} page={page} id={id} name={documentName} onClose={() => setQuizDialog(false)} onGenerate={config => { void controller.send({ id, page, name: documentName, question: quizRequestSummary(config), scope: "document", quiz: config }); }} />}
    {modelDialog && <CreationDialog documentName={documentName} configured={configured} page={page} onClose={() => setModelDialog(false)} onGenerate={(prompt, kind, scope) => { setModelDialog(false); void controller.send({ id, page, name: documentName, question: prompt, scope, visualization: true, artifactKind: kind }); }} />}
    <header className="chat-reader-header">
      <span className="chat-slide-label">Slide {page}</span>
      <div className="chat-reader-actions">
        <Button variant="outline" size="sm" onClick={() => setQuizDialog(true)} disabled={busy || disabled || !configured} aria-label="Crea quiz"><ClipboardList size={15} /> Quiz</Button>
        <Button variant="outline" size="sm" className="chat-mode-toggle" aria-pressed={wholeDocument} aria-describedby={scopeHintId} disabled={busy || disabled} onClick={() => setWholeDocument(value => !value)}><FileText size={15} /> Tutto PDF</Button>
        <Button variant="outline" size="sm" className="chat-model-button" aria-label="Crea materiale" title="Crea mappe, immagini e schemi" disabled={busy || disabled} onClick={() => setModelDialog(true)}><Sparkles size={16} /><span>Crea</span></Button>
        {onSettings && <Button variant="outline" size="icon" className="chat-reader-settings" aria-label="Impostazioni della lettura" onClick={onSettings}><Settings2 size={17} /></Button>}
      </div>
    </header>
    {onReturnToMap && <Button variant="outline" size="sm" className="chat-map-return" onClick={onReturnToMap}>Torna alla mappa</Button>}
    <div className="chat-scroll-area" ref={scrollArea} onScroll={event => { readingPosition.current = event.currentTarget.scrollTop; }}>
      <p className="chat-scope-hint" id={scopeHintId} aria-live="polite">{wholeDocument ? "Le domande riguardano tutto il PDF corrente, tenendo conto delle pagine lette e delle domande precedenti." : "Le domande riguardano questa slide, tenendo conto delle pagine lette e delle domande precedenti nel PDF."}</p>
      <SelectionNotes key={`${id}:${page}`} documentId={id} page={page} disabled={disabled || !configured}><div className="chat-messages">
        {explanation ? <ExplanationMessage explanation={explanation} page={page} disabled={busy || disabled || !configured} onDeepen={topic => void send(`Spiega in modo piu approfondito questo argomento della slide: ${topic}. Aggiungi i passaggi intermedi e un esempio concreto.`)} /> : <div className="chat-analysis-empty">
          <span className="chat-analysis-icon"><Sparkles size={25} strokeWidth={1.6} /></span>
          <h2>Partiamo da questa pagina.</h2>
          <p>Una spiegazione completa per capire i concetti. Poi puoi approfondirli con il tutor.</p>
          <div className="chat-analysis-actions">
            <Button variant="outline" disabled={busy || disabled || analyzing || batchRunning || analysisBusy || !configured || !onAnalyze} onClick={onAnalyze}>{analyzing && !batchRunning ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />} Analizza questa pagina</Button>
            <Button className="chat-analyze-all" disabled={busy || disabled || analyzing || batchRunning || analysisBusy || !configured || !onAnalyzeAll} onClick={onAnalyzeAll}>Analizza tutto</Button>
          </div>
          {analyzing && !batchRunning && <p role="status">Analisi di questa pagina in corso…</p>}
          {!configured && <p className="chat-analysis-configure">Configura OpenAI dalle impostazioni della lettura per iniziare.</p>}
        </div>}
        <div className="chat-conversation" aria-live="polite" aria-relevant="additions text">
          {conversation.filter(message => !message.quiz).map((message, index) => <article className={`chat-message ${message.role}`} key={`conversation-${index}`}><ChatMessageAuthor role={message.role} name={authorName} photoURL={user?.photoURL} />{message.artifact ? <StudyArtifactView key={message.artifact.id} artifact={message.artifact} documentId={id} page={page} onNavigatePage={onNavigatePage} onSaved={messages => controller.receiveMessages(id, page, messages)} /> : message.visualization ? <ConceptModelView model={message.visualization} /> : message.role === "assistant" ? <MarkdownContent>{message.content}</MarkdownContent> : <p>{message.content}</p>}{message.role === "assistant" && !message.visualization && !message.artifact && <Button variant="ghost" size="sm" className="deepen-button" disabled={busy || disabled || !configured} onClick={() => void send(`Approfondisci questa spiegazione con passaggi ed esempi: ${message.content.slice(0, 2800)}`)}><Sparkles size={14} /> Approfondisci</Button>}</article>)}
          {pendingQuestion && <article className="chat-message user is-pending"><ChatMessageAuthor role="user" name={authorName} photoURL={user?.photoURL} /><p>{pendingQuestion}</p></article>}
          {session?.streamingText && session.kind !== "quiz" && <article className="chat-message assistant is-streaming"><ChatMessageAuthor /><MarkdownContent>{session.streamingText}</MarkdownContent></article>}
          {busy && session?.kind === "visualization" && <div className="chat-generation-skeleton" role="status" aria-label="Generazione del materiale in corso"><Sparkles size={28} /><span>{session.materialKind === "image" || session.request?.artifactKind === "image" ? "Sto generando l'immagine..." : "Sto creando il materiale..."}</span></div>}
          {busy && session?.kind !== "visualization" && !session?.streamingText && <p className="chat-thinking" role="status"><LoaderCircle className="spin" size={15} aria-hidden="true" /> Sto approfondendo il materiale...</p>}
        </div>
      </div></SelectionNotes>
    </div>
    <div className="chat-composer-area"><label className="form-field-label chat-question-label" htmlFor={questionInputId}>Domanda al tutor</label>
      {showProgress && <BatchProgress progress={analysisProgress} running={batchRunning} onStop={onStopAnalysis} />}
      {error && <p className="chat-error" id={errorId} role="alert">{error}</p>}
      {error && session?.kind === "visualization" && <Button variant="outline" size="sm" onClick={() => controller.retry(chatSessionKey(id, page))}>Riprova generazione</Button>}
      <form className="chat-composer" onSubmit={event => { event.preventDefault(); void send(); }}>
        <Textarea id={questionInputId} ref={textarea} className="chat-composer-textarea" aria-label="Domanda al tutor" aria-describedby={error ? errorId : undefined} value={question} onChange={event => setQuestion(event.target.value)} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onKeyDown={event => {
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
