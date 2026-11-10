"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Check, RotateCcw, Trophy, X } from "lucide-react";
import type { StudyQuiz } from "@/lib/quiz";
import { MarkdownContent } from "./markdown-content";
import { TonyMascot } from "./mascot/tony-mascot";
import styles from "./quiz.module.css";

export function QuizCard({ quiz }: { quiz: StudyQuiz }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [checked, setChecked] = useState(false);
  const [finished, setFinished] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`studio-quiz:${quiz.id}`) || "null");
      if (saved && typeof saved.answers === "object" && saved.answers && !Array.isArray(saved.answers)) setAnswers(saved.answers);
      if (Number.isInteger(saved?.index)) setIndex(Math.max(0, Math.min(saved.index, quiz.questions.length - 1)));
      setChecked(saved?.checked === true);
      setFinished(saved?.finished === true || saved?.revealed === true);
    } catch {}
    setReady(true);
  }, [quiz.id, quiz.questions.length]);
  useEffect(() => {
    if (ready) { try { localStorage.setItem(`studio-quiz:${quiz.id}`, JSON.stringify({ answers, index, checked, finished })); } catch {} }
  }, [answers, index, checked, finished, ready, quiz.id]);
  const total = quiz.questions.length;
  const question = quiz.questions[index];
  const closed = quiz.questions.filter(item => item.type !== "open");
  const score = quiz.questions.filter((item, number) => item.type !== "open" && answers[number] === String(item.correctIndex)).length;
  const open = question?.type === "open";
  const correct = !open && answers[index] === String(question?.correctIndex);
  const mood = finished ? "happy" : checked && !open ? correct ? "happy" : "wrong" : "neutral";
  const selected = answers[index] || "";
  const canContinue = open ? !!selected.trim() : question?.options.some((_, optionIndex) => selected === String(optionIndex));
  function restart() { setAnswers({}); setIndex(0); setChecked(false); setFinished(false); }
  function next() {
    if (!checked) { setChecked(true); return; }
    if (index === total - 1) setFinished(true);
    else { setIndex(value => value + 1); setChecked(false); }
  }
  if (!question) return <p role="alert">Questo quiz non contiene domande.</p>;
  return <section className={styles.player} aria-label={`Quiz: ${quiz.title}`}>
    <header className={styles.playerHeader}><div><strong>{quiz.title}</strong><span>{quiz.documentName}</span></div><span className={styles.step}>{finished ? total : index + 1} / {total}</span></header>
    <progress className={styles.playerProgress} value={finished ? total : index + (checked ? 1 : 0)} max={total} aria-label="Avanzamento quiz" />
    {finished ? <div className={styles.finish}>
      <TonyMascot size={130} mood="happy" /><Trophy size={26} aria-hidden="true" /><h3>Quiz completato!</h3>
      <div role="status">{closed.length > 0 && <strong>{score} / {closed.length} risposte chiuse corrette.</strong>}{total > closed.length && <p>Le risposte aperte si confrontano con la risposta di riferimento e non rientrano nel punteggio.</p>}</div>
      <p>Un altro giro di ripasso? Il prossimo caffè lo preparo io.</p>
      <button className={styles.continue} type="button" onClick={restart}><RotateCcw size={16} /> Riprova il quiz</button>
    </div> : <>
      <div className={styles.challenge} key={index}>
        <div className={styles.questionHero}>
          <span className={styles.quizMascot} role="img" data-quiz-mood={mood} aria-label={mood === "happy" ? "Tony è contento: risposta corretta" : mood === "wrong" ? "Tony chiude gli occhi: risposta da ripassare" : "Tony ti accompagna nel quiz"}><TonyMascot size="100%" mood={mood} /></span>
          <div className={styles.prompt}><span className={styles.questionMeta}>DOMANDA {index + 1} · {open ? "RISPOSTA APERTA" : question.type === "true-false" ? "VERO O FALSO" : "SCEGLI LA RISPOSTA"}</span><MarkdownContent>{question.question}</MarkdownContent></div>
        </div>
        <span className={styles.topic}>{question.topic} · Pagina {question.page}</span>
        {open ? <textarea className={styles.openAnswer} aria-label={`Risposta alla domanda ${index + 1}`} value={selected} onChange={event => setAnswers(value => ({ ...value, [index]: event.target.value }))} rows={4} maxLength={5000} placeholder="Spiegalo con parole tue…" disabled={checked || !ready} /> : <div className={styles.choices} role="group" aria-label={`Risposte alla domanda ${index + 1}`}>
          {question.options.map((option, optionIndex) => <label key={optionIndex} data-selected={selected === String(optionIndex)} data-correct={checked && optionIndex === question.correctIndex} data-wrong={checked && selected === String(optionIndex) && !correct}>
            <input type="radio" name={`${quiz.id}:${index}`} aria-label={option} value={optionIndex} checked={selected === String(optionIndex)} onChange={() => setAnswers(value => ({ ...value, [index]: String(optionIndex) }))} disabled={checked || !ready} />
            <span className={styles.letter} aria-hidden="true">{checked && optionIndex === question.correctIndex ? <Check size={17} /> : checked && selected === String(optionIndex) && !correct ? <X size={17} /> : String.fromCharCode(65 + optionIndex)}</span><MarkdownContent>{option}</MarkdownContent>
          </label>)}
        </div>}
      </div>
      <footer className={styles.playerFooter} data-feedback={checked ? open ? "reference" : correct ? "correct" : "wrong" : "idle"}>
        {checked && <div className={styles.feedback} role="status"><strong>{open ? "Confronta la tua risposta" : correct ? "Esatto, ottimo lavoro!" : "Ci siamo quasi. Ripassiamola insieme."}</strong>
          {(open || !correct) && <><span>{open ? "Risposta di riferimento" : "La risposta corretta è:"}</span><MarkdownContent>{open ? question.modelAnswer : question.options[question.correctIndex!]}</MarkdownContent><span>Perché?</span><MarkdownContent>{question.explanation}</MarkdownContent></>}
        </div>}
        <button className={styles.continue} type="button" onClick={next} disabled={!ready || !canContinue}>{checked ? index === total - 1 ? "Vedi risultato" : "Prossima domanda" : "Continua"}<ArrowRight size={17} /></button>
      </footer>
    </>}
  </section>;
}
