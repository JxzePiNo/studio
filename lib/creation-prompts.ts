import type { ArtifactKind } from "./study-artifact";
export type CreationGoal = "understand" | "revise" | "connect";
export type CreationDepth = "overview" | "detailed" | "definitions";
export function creationPrompt({ kind, documentName, scope, goal = "understand", depth = "overview" }: { kind: ArtifactKind; documentName?: string; scope: "slide" | "document"; goal?: CreationGoal; depth?: CreationDepth }) {
  const material = scope === "document" ? "l'intero PDF" : "la pagina aperta del PDF";
  const title = documentName ? ` «${documentName.slice(0, 180)}»` : "";
  const goalText = { understand: "Aiutami a capire i concetti e il loro significato, spiegando i prerequisiti essenziali.", revise: "Aiutami a ripassare per l'esame: evidenzia ciò che devo saper definire, spiegare e collegare.", connect: "Aiutami a capire i collegamenti, le cause, le conseguenze e le differenze fra i concetti." }[goal];
  const depthText = { overview: "Preferisco una panoramica chiara e leggibile dei temi principali, con spiegazioni brevi.", detailed: "Preferisco una struttura approfondita, con sottoconcetti, passaggi intermedi e spiegazioni precise.", definitions: "Dai priorità alle definizioni fondamentali, distinguendo termini simili e condizioni di validità." }[depth];
  const request = kind === "map" ? "Crea una mappa concettuale gerarchica" : kind === "image" ? "Crea un'illustrazione didattica interattiva" : "Crea uno schema dei passaggi e delle relazioni";
  const specifics = kind === "image" ? "Scegli il soggetto più utile per studiare il materiale e rendi selezionabili le sue parti, con nome e funzione." : "Per ogni definizione o concetto presente nel materiale indica la pagina fisica del PDF in cui viene spiegato, così posso aprirla cliccando il nodo. Per i nodi di sintesi senza una pagina specifica non inventare riferimenti.";
  return `${request} su ${material}${title}. ${goalText} ${depthText} ${specifics} Usa il materiale allegato e il contesto del mio corso; segnala ciò che non è presente o è incerto.`;
}
