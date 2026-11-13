"use client";

import { QuizPeerResults } from "./quiz-peer-results";
import { openShare } from "@/lib/sharing-client";
import { Button } from "./ui/button";
import { useEffect, useState } from "react";
import { ArrowRight, Check, Clock3, Trophy, Share2, X } from "lucide-react";
import { authHeaders } from "@/lib/firebase-client";
import type { StudyQuiz } from "@/lib/quiz";
import { quizResult } from "@/lib/quiz-score";
import { quizOptionOrder } from "@/lib/quiz-options";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { MarkdownContent } from "./markdown-content";
import { TonyMascot } from "./mascot/tony-mascot";
import { BaristaLoading } from "./barista-loading";
import styles from "./quiz.module.css";
import { useQuizAttempt } from "./use-quiz-attempt";
import { useQuizResult } from "./use-quiz-result";

export function QuizCard({ quiz, onClose }: { quiz: StudyQuiz; onClose: () => void }) {
  const { answers, index, checked, finished, ready, remainingSeconds, expiredQuestions, totalExpired, select, next } = useQuizAttempt(quiz);
  const resultSave = useQuizResult(quiz, answers, finished, ready);
  const [expanded, setExpanded] = useState<Record<string, string>>({});
  const [explanationState, setExplanationState] = useState<{ key: string; status: "loading" | "error" } | null>(null);
  const [answerTab, setAnswerTab] = useState("answer");
  const [retry, setRetry] = useState(0);
  const total = quiz.questions.length;
  const question = quiz.questions[index];
  const closed = quiz.questions.filter(item => item.type !== "open");
  const score = quiz.questions.filter((item, number) => item.type !== "open" && answers[number] === String(item.correctIndex)).length;
  const open = question?.type === "open";
  const correct = !open && answers[index] === String(question?.correctIndex);
  const { percentage, grade, passed } = quizResult(score, closed.length);
  const mood = finished ? closed.length ? passed ? "happy" : "wrong" : "neutral" : checked && !open ? correct ? "happy" : "wrong" : "neutral";
  const selected = answers[index] || "";
  const canContinue = open ? !!selected.trim() : question?.options.some((_, optionIndex) => selected === String(optionIndex));
  const explanationKey = `${quiz.id}:${index}:${selected}`;
  const explanationError = explanationState?.key === explanationKey && explanationState.status === "error";
  const explanationLoading = !open && !correct && canContinue && !expanded[explanationKey] && !explanationError;
  useEffect(() => { if (checked) setAnswerTab("answer"); }, [checked, index]);
  useEffect(() => {
    if (!ready || finished || !checked || open || correct || !canContinue || expanded[explanationKey]) return;
    const controller = new AbortController();
    setExplanationState({ key: explanationKey, status: "loading" });
    void (async () => {
      try {
        const response = await fetch(`/api/documents/${quiz.documentId}/quiz/${quiz.id}/explain`, {
          method: "POST", headers: { "Content-Type": "application/json", ...await authHeaders() },
          body: JSON.stringify({ questionIndex: index, selectedIndex: Number(selected) }), signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok || typeof data.explanation !== "string" || !data.explanation.trim()) throw new Error("Approfondimento non disponibile");
        if (!controller.signal.aborted) { setExpanded(value => ({ ...value, [explanationKey]: data.explanation })); setExplanationState(null); }
      } catch { if (!controller.signal.aborted) setExplanationState({ key: explanationKey, status: "error" }); }
    })();
    return () => controller.abort();
  }, [ready, finished, checked, open, correct, canContinue, explanationKey, expanded, quiz.documentId, quiz.id, index, selected, retry]);
  if (!question) return <p role="alert">Questo quiz non contiene domande.</p>;
  return <section className={styles.player} aria-label={`Quiz: ${quiz.title}`}>
    <header className={styles.playerHeader}><div><strong>{quiz.title}</strong><span>{quiz.documentName}{quiz.difficulty && ` · Difficoltà ${quiz.difficulty === "avanzata" ? "alta" : quiz.difficulty}`}</span></div><Button variant="ghost" size="icon" aria-label="Condividi quiz" onClick={() => openShare({ kind: "quiz", id: quiz.id, documentId: quiz.documentId, name: quiz.title })}><Share2 size={17} /></Button><span className={styles.step}>{finished ? total : index + 1} / {total}</span></header>
    {quiz.timing && !finished && <div className={styles.timer} data-low={remainingSeconds !== null && remainingSeconds <= 10}><Clock3 size={17} /><span>{quiz.timing.mode === "question" ? "Tempo per domanda" : "Tempo totale"}</span><strong role="timer" aria-label={quiz.timing.mode === "question" ? "Tempo rimanente per la domanda" : "Tempo totale rimanente"}>{remainingSeconds === null ? "In pausa" : `${Math.floor(remainingSeconds / 60).toString().padStart(2, "0")}:${(remainingSeconds % 60).toString().padStart(2, "0")}`}</strong></div>}
    <progress className={styles.playerProgress} value={finished ? total : index + (checked ? 1 : 0)} max={total} aria-label="Avanzamento quiz" />
    {finished ? <div className={styles.finish}>
      {totalExpired && <p role="status">Tempo totale scaduto. Il quiz è stato consegnato automaticamente.</p>}
      <span role="img" data-quiz-mood={mood} aria-label={passed ? "Tony è contento: quiz superato" : closed.length ? "Tony chiude gli occhi: quiz da ripassare" : "Tony ti accompagna nel ripasso"}><TonyMascot size={130} mood={mood} /></span>
      {passed && <Trophy size={26} aria-hidden="true" />}<h3>{closed.length ? passed ? "Quiz superato!" : "Quiz da ripassare" : "Quiz completato!"}</h3>
      <div role="status">{closed.length > 0 && <><strong>{score} / {closed.length} risposte chiuse corrette.</strong><p className={styles.grade}>Voto: {grade}/30 · {Number(percentage!.toFixed(1))}%</p><p>{passed ? "Ottimo lavoro, hai superato il quiz!" : "Per superare il quiz serve più del 60% di risposte corrette. Ripassa le spiegazioni e continua ad allenarti."}</p></>}{total > closed.length && <p>Le risposte aperte si confrontano con la risposta di riferimento e non rientrano nel punteggio.{closed.length === 0 ? " Questo quiz non prevede un voto automatico." : " Il voto considera solo le domande chiuse."}</p>}</div>
      {resultSave.status === "saving" && <p aria-live="polite">Salvo il punteggio…</p>}
      {resultSave.status === "error" && <p role="alert">Non riesco a salvare il punteggio. <button type="button" className={styles.retryExplanation} onClick={resultSave.retry}>Riprova salvataggio</button></p>}
      <QuizPeerResults quiz={quiz} saved={resultSave.status === "saved"} />
      <button className={styles.continue} type="button" onClick={onClose}>Chiudi Quiz</button>
    </div> : <>
      <Tabs value={checked ? answerTab : "question"} onValueChange={setAnswerTab} className={styles.answerTabs}>
      {checked && <TabsList aria-label="Domanda e risposta"><TabsTrigger value="question">Domanda</TabsTrigger><TabsTrigger value="answer">Risposta</TabsTrigger></TabsList>}
      <TabsContent value="question">
      <div className={styles.challenge} key={index}>
        <div className={styles.questionHero}>
          <span className={styles.quizMascot} role="img" data-quiz-mood={mood} aria-label={mood === "happy" ? "Tony è contento: risposta corretta" : mood === "wrong" ? "Tony chiude gli occhi: risposta da ripassare" : "Tony ti accompagna nel quiz"}><TonyMascot size="100%" mood={mood} /></span>
          <div className={styles.prompt}><span className={styles.questionMeta}>DOMANDA {index + 1} · {open ? "RISPOSTA APERTA" : question.type === "true-false" ? "VERO O FALSO" : "SCEGLI LA RISPOSTA"}</span><MarkdownContent>{question.question}</MarkdownContent></div>
        </div>
        <span className={styles.topic}>{question.topic} · Pagina {question.page}</span>
        {open ? <textarea className={styles.openAnswer} aria-label={`Risposta alla domanda ${index + 1}`} value={selected} onChange={event => select(event.target.value)} rows={4} maxLength={5000} placeholder="Spiegalo con parole tue…" disabled={checked || !ready} /> : <div className={styles.choices} role="group" aria-label={`Risposte alla domanda ${index + 1}`}>
          {quizOptionOrder(quiz, index).map((optionIndex, displayIndex) => { const option = question.options[optionIndex]; return <label key={optionIndex} data-selected={selected === String(optionIndex)} data-correct={checked && optionIndex === question.correctIndex} data-wrong={checked && selected === String(optionIndex) && !correct}>
            <input type="radio" name={`${quiz.id}:${index}`} aria-label={option} value={optionIndex} checked={selected === String(optionIndex)} onChange={() => select(String(optionIndex))} disabled={checked || !ready} />
            <span className={styles.letter} aria-hidden="true">{checked && optionIndex === question.correctIndex ? <Check size={17} /> : checked && selected === String(optionIndex) && !correct ? <X size={17} /> : String.fromCharCode(65 + displayIndex)}</span><MarkdownContent>{option}</MarkdownContent>
          </label>; })}
        </div>}
      </div>
      </TabsContent>
      {checked && <TabsContent value="answer" className={styles.answerContent}>
        <div className={styles.answerHeading}><span role="img" data-quiz-mood={mood} aria-label={mood === "happy" ? "Tony è contento: risposta corretta" : mood === "wrong" ? "Tony chiude gli occhi: risposta da ripassare" : "Tony ti accompagna nel quiz"}><TonyMascot size={70} mood={mood} showName={false} /></span><strong role="status">{open ? "Confronta la tua risposta" : correct ? "Esatto, ottimo lavoro!" : "Ci siamo quasi. Ripassiamola insieme."}</strong></div>
        {!open && !correct && selected && <section className={styles.answerWrong} aria-label="La tua risposta errata"><h3><X size={16} aria-hidden="true" />La tua risposta è sbagliata</h3><MarkdownContent>{question.options[Number(selected)]}</MarkdownContent></section>}
        <section className={styles.answerSolution} aria-label="Risposta corretta"><h3>{open ? "Risposta di riferimento" : "La risposta corretta è:"}</h3><MarkdownContent>{open ? question.modelAnswer : question.options[question.correctIndex!]}</MarkdownContent></section>
        <section aria-label="Spiegazione della risposta" aria-busy={explanationLoading}>
          <h3>Perché?</h3>
          {explanationLoading ? <BaristaLoading name="La spiegazione del quiz" statusText="Caricamento della spiegazione." hint="Tony sta preparando la spiegazione…" /> : <MarkdownContent>{!open && expanded[explanationKey] || question.explanation}</MarkdownContent>}
          {explanationError && <p className={styles.explanationHint}>L’approfondimento non è disponibile. Puoi leggere la spiegazione del quiz o <button type="button" className={styles.retryExplanation} onClick={() => { setExplanationState({ key: explanationKey, status: "loading" }); setRetry(value => value + 1); }}>riprova</button>.</p>}
        </section>
      </TabsContent>}
      </Tabs>
      {expiredQuestions.includes(index) && <p className={styles.timeout} role="status">Tempo scaduto. {selected ? "La risposta presente è stata confermata automaticamente." : "Nessuna risposta inviata per questa domanda."}</p>}
      <footer className={styles.playerFooter} data-feedback={checked ? open ? "reference" : correct ? "correct" : "wrong" : "idle"}>
        <button className={styles.continue} type="button" onClick={next} disabled={!ready || (!checked && !canContinue)}>{checked ? index === total - 1 ? "Vedi risultato" : "Prossima domanda" : "Continua"}<ArrowRight size={17} /></button>
      </footer>
    </>}
  </section>;
}
