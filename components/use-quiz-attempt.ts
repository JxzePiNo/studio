"use client";

import { useEffect, useState } from "react";
import type { StudyQuiz } from "@/lib/quiz";
import { expireQuizAttempt, restoreQuizAttempt, serializeQuizAttempt, transitionQuizAttempt, type QuizAttempt, type QuizAttemptAction } from "@/lib/quiz-attempt";

export function useQuizAttempt(quiz: StudyQuiz) {
  const [attempt, setAttempt] = useState<{ id: string; state: QuizAttempt } | null>(null);
  const [clock, setClock] = useState(0);
  const ready = attempt?.id === quiz.id;
  const state = ready ? attempt.state : restoreQuizAttempt({ ...quiz, timing: undefined }, null, 0);
  useEffect(() => {
    let saved: unknown = null;
    try { saved = JSON.parse(localStorage.getItem(`studio-quiz:${quiz.id}`) || "null"); } catch {}
    const now = Date.now();
    setAttempt({ id: quiz.id, state: restoreQuizAttempt(quiz, saved, now) }); setClock(now);
  }, [quiz.id]);
  useEffect(() => {
    if (ready) { try { localStorage.setItem(`studio-quiz:${quiz.id}`, serializeQuizAttempt(quiz, state)); } catch {} }
  }, [ready, state, quiz]);
  useEffect(() => {
    if (!ready || !quiz.timing || state.finished || (state.checked && quiz.timing.mode === "question")) return;
    const tick = () => {
      const now = Date.now(); setClock(now);
      setAttempt(previous => {
        if (!previous || previous.id !== quiz.id) return previous;
        const state = expireQuizAttempt(quiz, previous.state, now);
        return state === previous.state ? previous : { id: quiz.id, state };
      });
    };
    const timer = setInterval(tick, 250);
    window.addEventListener("focus", tick); document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(timer); window.removeEventListener("focus", tick); document.removeEventListener("visibilitychange", tick); };
  }, [ready, quiz, state.finished, state.checked]);
  function act(action: QuizAttemptAction) {
    const now = Date.now(); setClock(now);
    setAttempt(previous => previous?.id === quiz.id ? { id: quiz.id, state: transitionQuizAttempt(quiz, previous.state, action, now) } : previous);
  }
  return { ...state, ready, remainingSeconds: state.deadline === null ? null : Math.max(0, Math.ceil((state.deadline - clock) / 1000)), select: (value: string) => act({ type: "answer", value }), next: () => act({ type: "next" }) };
}
