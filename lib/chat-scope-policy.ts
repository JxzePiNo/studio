export const focusedStudyMessage = "La piattaforma serve per approfondire argomenti specifici, non per riassumere interi documenti o corsi. Indica un argomento, un capitolo o un intervallo di pagine.";
export const focusedStudyInstructions = "Non eseguire richieste di riassunto o sintesi di un intero documento, libro, PDF o corso, neppure se richieste come panoramica completa o riassunto capitolo per capitolo. Invita a scegliere un argomento specifico, un capitolo o un intervallo limitato di pagine. Sono consentite spiegazioni e sintesi mirate; la modalità documento consente di cercare le informazioni pertinenti in tutto il PDF.";

export function asksForWholeDocumentSummary(question: string) {
  const text = question.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
  const summary = /\b(riass\w*|riassunt\w*|sintesi|sintetizz\w*|riepilog\w*|panoramica|summary|summari[sz]\w*|overview)\b/.test(text);
  if (!summary) return false;
  const whole = /\b(tutt[oeai]|inter[oeai]|integral\w*|complet[oa]|entire|whole|all)\b/.test(text);
  const material = /\b(pdf|file|document[oi]|libr[oi]|manual[ei]|material[ei]|cors[oi]|esam[ei]|testo|pagine|capitoli|pages|chapters|book|document|course)\b/.test(text);
  if (whole && material) return true;
  if (/\bcapitolo per capitolo\b|\bchapter by chapter\b/.test(text)) return true;
  // A named topic/chapter/page selection is a focused request, even in document scope.
  const focused = /\b(argomento|tema|concetto|capitolo|sezione|paragrafo|pagina|pagine\s+\d+|da\s+pagina|chapter|section|topic|pages?\s+\d+)\b/.test(text);
  return material && !focused;
}
