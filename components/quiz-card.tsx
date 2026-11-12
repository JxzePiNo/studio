"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Check, Clock3, Trophy, X } from "lucide-react";
import { authHeaders } from "@/lib/firebase-client";
import type { StudyQuiz } from "@/lib/quiz";
import { quizResult } from "@/lib/quiz-score";
import { MarkdownContent } from "./markdown-content";
import { TonyMascot } from "./mascot/tony-mascot";
import styles from "./quiz.module.css";
import { useQuizAttempt } from "./use-quiz-attempt";

export function QuizCard({ quiz, onClose }: { quiz: StudyQuiz; onClose: () => void }) {
  const { answers, index, checked, finished, ready, remainingSeconds, expiredQuestions, totalExpired, select, next } = useQuizAttempt(quiz);
  const [expanded, setExpanded] = useState<Record<string, string>>({});
  const [explanationState, setExplanationState] = useState<"idle" | "loading" | "error">("idle");
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
  useEffect(() => {
    if (!ready || finished || !checked || open || correct || !canContinue || expanded[explanationKey]) return;
    const controller = new AbortController();
    setExplanationState("loading");
    void (async () => {
      try {
        const response = await fetch(`/api/documents/${quiz.documentId}/quiz/${quiz.id}/explain`, {
          method: "POST", headers: { "Content-Type": "application/json", ...await authHeaders() },
          body: JSON.stringify({ questionIndex: index, selectedIndex: Number(selected) }), signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok || typeof data.explanation !== "string" || !data.explanation.trim()) throw new Error("Approfondimento non disponibile");
        if (!controller.signal.aborted) { setExpanded(value => ({ ...value, [explanationKey]: data.explanation })); setExplanationState("idle"); }
      } catch { if (!controller.signal.aborted) setExplanationState("error"); }
    })();
    return () => controller.abort();
  }, [ready, finished, checked, open, correct, canContinue, explanationKey, expanded, quiz.documentId, quiz.id, index, selected, retry]);
  if (!question) return <p role="alert">Questo quiz non contiene domande.</p>;
  return <section className={styles.player} aria-label={`Quiz: ${quiz.title}`}>
    <header className={styles.playerHeader}><div><strong>{quiz.title}</strong><span>{quiz.documentName}{quiz.difficulty && ` · Difficoltà ${quiz.difficulty === "avanzata" ? "alta" : quiz.difficulty}`}</span></div><span className={styles.step}>{finished ? total : index + 1} / {total}</span></header>
    {quiz.timing && !finished && <div className={styles.timer} data-low={remainingSeconds !== null && remainingSeconds <= 10}><Clock3 size={17} /><span>{quiz.timing.mode === "question" ? "Tempo per domanda" : "Tempo totale"}</span><strong role="timer" aria-label={quiz.timing.mode === "question" ? "Tempo rimanente per la domanda" : "Tempo totale rimanente"}>{remainingSeconds === null ? "In pausa" : `${Math.floor(remainingSeconds / 60).toString().padStart(2, "0")}:${(remainingSeconds % 60).toString().padStart(2, "0")}`}</strong></div>}
    <progress className={styles.playerProgress} value={finished ? total : index + (checked ? 1 : 0)} max={total} aria-label="Avanzamento quiz" />
    {finished ? <div className={styles.finish}>
      {totalExpired && <p role="status">Tempo totale scaduto. Il quiz è stato consegnato automaticamente.</p>}
      <span role="img" data-quiz-mood={mood} aria-label={passed ? "Tony è contento: quiz superato" : closed.length ? "Tony chiude gli occhi: quiz da ripassare" : "Tony ti accompagna nel ripasso"}><TonyMascot size={130} mood={mood} /></span>
      {passed && <Trophy size={26} aria-hidden="true" />}<h3>{closed.length ? passed ? "Quiz superato!" : "Quiz da ripassare" : "Quiz completato!"}</h3>
      <div role="status">{closed.length > 0 && <><strong>{score} / {closed.length} risposte chiuse corrette.</strong><p className={styles.grade}>Voto: {grade}/30 · {Number(percentage!.toFixed(1))}%</p><p>{passed ? "Ottimo lavoro, hai superato il quiz!" : "Per superare il quiz serve più del 60% di risposte corrette. Ripassa le spiegazioni e continua ad allenarti."}</p></>}{total > closed.length && <p>Le risposte aperte si confrontano con la risposta di riferimento e non rientrano nel punteggio.{closed.length === 0 ? " Questo quiz non prevede un voto automatico." : " Il voto considera solo le domande chiuse."}</p>}</div>
      <button className={styles.continue} type="button" onClick={onClose}>Chiudi Quiz</button>
    </div> : <>
      <div className={styles.challenge} key={index}>
        <div className={styles.questionHero}>
          <span className={styles.quizMascot} role="img" data-quiz-mood={mood} aria-label={mood === "happy" ? "Tony è contento: risposta corretta" : mood === "wrong" ? "Tony chiude gli occhi: risposta da ripassare" : "Tony ti accompagna nel quiz"}><TonyMascot size="100%" mood={mood} /></span>
          <div className={styles.prompt}><span className={styles.questionMeta}>DOMANDA {index + 1} · {open ? "RISPOSTA APERTA" : question.type === "true-false" ? "VERO O FALSO" : "SCEGLI LA RISPOSTA"}</span><MarkdownContent>{question.question}</MarkdownContent></div>
        </div>
        <span className={styles.topic}>{question.topic} · Pagina {question.page}</span>
        {open ? <textarea className={styles.openAnswer} aria-label={`Risposta alla domanda ${index + 1}`} value={selected} onChange={event => select(event.target.value)} rows={4} maxLength={5000} placeholder="Spiegalo con parole tue…" disabled={checked || !ready} /> : <div className={styles.choices} role="group" aria-label={`Risposte alla domanda ${index + 1}`}>
          {question.options.map((option, optionIndex) => <label key={optionIndex} data-selected={selected === String(optionIndex)} data-correct={checked && optionIndex === question.correctIndex} data-wrong={checked && selected === String(optionIndex) && !correct}>
            <input type="radio" name={`${quiz.id}:${index}`} aria-label={option} value={optionIndex} checked={selected === String(optionIndex)} onChange={() => select(String(optionIndex))} disabled={checked || !ready} />
            <span className={styles.letter} aria-hidden="true">{checked && optionIndex === question.correctIndex ? <Check size={17} /> : checked && selected === String(optionIndex) && !correct ? <X size={17} /> : String.fromCharCode(65 + optionIndex)}</span><MarkdownContent>{option}</MarkdownContent>
          </label>)}
        </div>}
      </div>
      {expiredQuestions.includes(index) && <p className={styles.timeout} role="status">Tempo scaduto. {selected ? "La risposta presente è stata confermata automaticamente." : "Nessuna risposta inviata per questa domanda."}</p>}
      <footer className={styles.playerFooter} data-feedback={checked ? open ? "reference" : correct ? "correct" : "wrong" : "idle"}>
        {checked && <div className={styles.feedback} role="status"><strong>{open ? "Confronta la tua risposta" : correct ? "Esatto, ottimo lavoro!" : "Ci siamo quasi. Ripassiamola insieme."}</strong>
          {(open || !correct) && <><span>{open ? "Risposta di riferimento" : "La risposta corretta è:"}</span><MarkdownContent>{open ? question.modelAnswer : question.options[question.correctIndex!]}</MarkdownContent><span>Perché?</span><MarkdownContent>{!open && expanded[explanationKey] || question.explanation}</MarkdownContent>
          {!open && !expanded[explanationKey] && explanationState === "loading" && <p className={styles.explanationHint}>Sto preparando una spiegazione più approfondita… Puoi già continuare.</p>}
          {!open && !expanded[explanationKey] && explanationState === "error" && <p className={styles.explanationHint}>L’approfondimento non è disponibile. Puoi continuare o <button type="button" className={styles.retryExplanation} onClick={() => setRetry(value => value + 1)}>riprova</button>.</p>}</>}
        </div>}
        <button className={styles.continue} type="button" onClick={next} disabled={!ready || (!checked && !canContinue)}>{checked ? index === total - 1 ? "Vedi risultato" : "Prossima domanda" : "Continua"}<ArrowRight size={17} /></button>
      </footer>
    </>}
  </section>;
}
