"use client";

import { useCallback, useEffect, useState } from "react";
import { takeTonyPhrase, tonyPhrases, type PhraseDeck, type TonyPhraseContext } from "@/lib/tony-phrases";

const decks = new Map<TonyPhraseContext, PhraseDeck>();

export function useTonyPhrase(context: TonyPhraseContext, interval = 12000, paused = false) {
  const [current, setCurrent] = useState({ context, phrase: tonyPhrases[context][0] });
  const next = useCallback(() => {
    const key = `studio-tony-phrases:${context}`;
    let previous = decks.get(context);
    if (!previous) {
      try {
        const saved = JSON.parse(sessionStorage.getItem(key) || "null");
        if (saved && Array.isArray(saved.remaining) && saved.remaining.every((item: unknown) => typeof item === "string")) previous = saved;
      } catch { /* Storage can be unavailable; the in-memory deck still rotates. */ }
    }
    const { phrase, deck } = takeTonyPhrase(context, previous);
    decks.set(context, deck);
    try { sessionStorage.setItem(key, JSON.stringify(deck)); } catch { /* Keep the in-memory deck. */ }
    setCurrent({ context, phrase });
  }, [context]);

  useEffect(() => {
    if (paused) return;
    next();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") next(); }, interval);
    return () => window.clearInterval(timer);
  }, [next, interval, paused]);

  return { phrase: current.context === context ? current.phrase : tonyPhrases[context][0], next };
}
