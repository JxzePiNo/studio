import type { ChatMessage, Explanation } from "./types";

export function explanationMessage(explanation?: Explanation): ChatMessage | undefined {
  if (!explanation) return undefined;
  const parts = [explanation.title, explanation.overview,
    ...explanation.concepts.map(concept => `${concept.title}\n${concept.explanation}`),
    explanation.example ? `Esempio svolto (aggiuntivo)\n${explanation.example}` : "",
    explanation.takeaway ? `Da ricordare\n${explanation.takeaway}` : "",
    explanation.glossary.length ? `Glossario\n${explanation.glossary.map(term => `${term.word} — ${term.translation}${term.context ? `: ${term.context}` : ""}`).join("\n")}` : "",
  ];
  return { role: "assistant", content: parts.filter(Boolean).join("\n\n"), source: "analysis" };
}

/** Analysis is derived from the saved explanation, so regeneration updates one
 * opening message while preserving the subsequent questions and answers. */
export function withAnalysisMessage(explanation: Explanation | undefined, messages: ChatMessage[]): ChatMessage[] {
  const seed = explanationMessage(explanation);
  return [...(seed ? [seed] : []), ...messages.filter(message => message.source !== "analysis")];
}

/** Long graduate-level replies must still fit a Firestore slide document. */
export function boundedChatHistory(messages: ChatMessage[]): ChatMessage[] {
  const history = messages.filter(message => message.source !== "analysis").slice(-40);
  const encoder = new TextEncoder();
  while (history.length > 2 && encoder.encode(JSON.stringify(history)).byteLength > 280_000) history.splice(0, 2);
  return history;
}
