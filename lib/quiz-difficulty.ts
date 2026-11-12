import type { QuizConfig } from "./quiz";

export function isStemQuizContext(context: string) {
  return /informat|ingegner|matemat|fisic|chimic|biolog|biotec|statistic|medicin|odontoiatr|farmac|veterinar|geolog|astronom|computer|engineering|physics|chemistry|biology|data science|machine learning|intelligenza artificiale|artificial intelligence/i.test(context);
}

export function quizDifficulty(config: QuizConfig, context: string): QuizConfig["difficulty"] {
  return isStemQuizContext(context) ? "avanzata" : config.difficulty;
}

export const quizAcademicInstructions = `Difficoltà e calibrazione: usa il corso di laurea e la materia nel contesto per scegliere terminologia, prerequisiti e tipo di ragionamento da esame. Rispetta il livello effettivo del percorso indicato (triennale o magistrale); se non specificato, adotta un livello universitario avanzato senza inventare il programma del corso.
Per materie STEM la difficoltà resta sempre alta: privilegia applicazioni non immediate, piccoli problemi quantitativi, interpretazione di formule, codice, dati o grafici, condizioni di validità, casi limite e collegamenti tra risultati. Usa solo i contenuti delle pagine allegate; non introdurre argomenti di pagine successive.
Per difficoltà avanzata richiedi almeno due passaggi concettuali o una discriminazione specialistica non ovvia. Evita domande risolvibili copiando una frase, riconoscendo una parola chiave o eliminando tre alternative palesemente assurde. Nelle discipline umanistiche, giuridiche e sociali usa analisi di casi, confronto di interpretazioni e conseguenze di tesi, senza formalismi fuori luogo.
Le alternative devono essere plausibili, omogenee per lunghezza e precisione, e corrispondere a errori realistici della materia; la soluzione deve essere univoca. Nelle domande vero/falso usa proposizioni sottili ma non ambigue; nelle aperte richiedi argomentazioni o procedimenti. Per base e intermedia su materie non STEM mantieni comunque il rigore universitario. La difficoltà non deve derivare da trabocchetti linguistici, conoscenze estranee al PDF o dati mancanti. L'eventuale timer non è un motivo per banalizzare le domande.`;
