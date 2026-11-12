import type { GraphArtifact } from "./study-artifact";

export const heartMap: GraphArtifact = {
  id: "55e45850-c145-49a6-b74b-abc2b77d3459", kind: "map", title: "Il cuore umano", summary: "Camere, valvole e circolazione: esplora i collegamenti e seleziona i concetti.", note: "Esempio didattico semplificato. Fonte: NHLBI, How the Heart Works (nhlbi.nih.gov/health/heart/blood-flow).", rootId: "heart",
  nodes: [
    { id: "heart", label: "Cuore", description: "Pompa muscolare che mantiene il sangue in circolo attraverso due circuiti collegati.", color: "#fecdd3" },
    { id: "right", label: "Cuore destro", description: "Riceve il sangue dalla circolazione sistemica e lo invia ai polmoni.", color: "#bfdbfe" },
    { id: "left", label: "Cuore sinistro", description: "Riceve il sangue ossigenato dai polmoni e lo invia al resto del corpo.", color: "#fecaca" },
    { id: "atrium-r", label: "Atrio destro", description: "Riceve il sangue dalle vene cave e dal seno coronarico.", color: "#dbeafe" },
    { id: "ventricle-r", label: "Ventricolo destro", description: "Spinge il sangue nell'arteria polmonare attraverso la valvola polmonare.", color: "#dbeafe" },
    { id: "atrium-l", label: "Atrio sinistro", description: "Riceve il sangue ossigenato attraverso le vene polmonari.", color: "#fee2e2" },
    { id: "ventricle-l", label: "Ventricolo sinistro", description: "Spinge il sangue nell'aorta. La sua parete muscolare sostiene la pressione della circolazione sistemica.", color: "#fee2e2" },
    { id: "valves", label: "Valvole", description: "Si aprono e si chiudono in base ai gradienti di pressione, limitando il reflusso.", color: "#ddd6fe" },
    { id: "av", label: "Tricuspide e mitrale", description: "Valvole atrioventricolari: la tricuspide è a destra, la mitrale a sinistra.", color: "#ede9fe" },
    { id: "semilunar", label: "Polmonare e aortica", description: "Valvole semilunari, poste all'uscita dei ventricoli.", color: "#ede9fe" },
  ],
  edges: [["heart", "right"], ["heart", "left"], ["heart", "valves"], ["right", "atrium-r"], ["right", "ventricle-r"], ["left", "atrium-l"], ["left", "ventricle-l"], ["valves", "av"], ["valves", "semilunar"]].map(([source, target], index) => ({ id: `edge-${index}`, source, target, label: "" })),
};
