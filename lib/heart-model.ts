import type { ConceptModel, ConceptPart } from "./concept-model";

const zero = { x: 0, y: 0, z: 0 };
const ellipsoid = (id: string, name: string, description: string, color: string, position: ConceptPart["position"], size: ConceptPart["size"]): ConceptPart => ({ id, name, description, color, position, size, shape: "ellipsoid", rotation: zero, points: [] });
const tube = (id: string, name: string, description: string, color: string, points: ConceptPart["points"], radius: number): ConceptPart => ({ id, name, description, color, points, shape: "tube", position: zero, size: { x: radius, y: 1, z: 1 }, rotation: zero });

export const heartModel: ConceptModel = {
  id: "72c52c49-bb71-4c89-9934-a25e32ad04f1",
  title: "Il cuore, parte per parte",
  summary: "Esplora quattro camere, quattro valvole e vasi principali. Ruota il modello e seleziona una parte per capire il suo ruolo.",
  note: "Schema 3D didattico: forme e proporzioni sono semplificate. I lati sono quelli anatomici del paziente; rosso e blu distinguono convenzionalmente il sangue ossigenato e quello povero di ossigeno.",
  reference: { title: "Anatomia e flusso del sangue · NHLBI, NIH", url: "https://www.nhlbi.nih.gov/health/heart/blood-flow" },
  parts: [
    ellipsoid("atrio-destro", "Atrio destro", "Riceve dalle vene cave il sangue povero di ossigeno proveniente dal corpo e lo passa al ventricolo destro.", "#637dbb", { x: -0.7, y: 0.6, z: 0.05 }, { x: 0.6, y: 0.65, z: 0.55 }),
    ellipsoid("atrio-sinistro", "Atrio sinistro", "Riceve dalle vene polmonari il sangue ossigenato nei polmoni e lo passa al ventricolo sinistro.", "#e57a83", { x: 0.55, y: 0.65, z: -0.3 }, { x: 0.55, y: 0.55, z: 0.5 }),
    ellipsoid("ventricolo-destro", "Ventricolo destro", "Spinge il sangue verso i polmoni attraverso la valvola polmonare e l'arteria polmonare.", "#8a9bd0", { x: -0.4, y: -0.45, z: 0.4 }, { x: 0.7, y: 1.05, z: 0.6 }),
    ellipsoid("ventricolo-sinistro", "Ventricolo sinistro", "Spinge il sangue ossigenato nell'aorta per distribuirlo al corpo. La sua parete muscolare è più spessa.", "#c84c66", { x: 0.45, y: -0.6, z: -0.05 }, { x: 0.65, y: 1.2, z: 0.65 }),
    tube("aorta", "Aorta", "È la grande arteria che porta al corpo il sangue pompato dal ventricolo sinistro.", "#e75a62", [{ x: 0.5, y: 0.15, z: -0.15 }, { x: 0.5, y: 1.4, z: -0.1 }, { x: 0.1, y: 1.8, z: -0.15 }, { x: -0.45, y: 1.55, z: -0.5 }, { x: -0.45, y: 0.7, z: -0.8 }], 0.2),
    tube("arteria-polmonare", "Arteria polmonare", "Porta ai polmoni il sangue povero di ossigeno proveniente dal ventricolo destro.", "#607db8", [{ x: -0.2, y: 0.05, z: 0.65 }, { x: -0.05, y: 1.1, z: 0.7 }, { x: -0.5, y: 1.35, z: 0.55 }, { x: -1.35, y: 1.1, z: 0.15 }], 0.18),
    tube("vena-cava", "Vena cava superiore", "Riporta all'atrio destro il sangue proveniente dalla parte superiore del corpo.", "#506caa", [{ x: -0.85, y: 1.9, z: 0 }, { x: -0.85, y: 1.25, z: 0 }, { x: -0.7, y: 0.7, z: 0 }], 0.18),
    tube("vene-polmonari", "Vene polmonari", "Riportano all'atrio sinistro il sangue ossigenato nei polmoni. Qui sono rappresentate da un solo collegamento.", "#df7881", [{ x: 1.45, y: 0.85, z: -0.45 }, { x: 1, y: 0.8, z: -0.4 }, { x: 0.55, y: 0.65, z: -0.3 }], 0.15),
    { ...ellipsoid("tricuspide", "Valvola tricuspide", "Si trova tra atrio e ventricolo destro e ostacola il ritorno del sangue verso l'atrio.", "#b7c9ef", { x: -0.5, y: 0.05, z: 0.3 }, { x: 0.32, y: 0.32, z: 0.32 }), shape: "ring", rotation: { x: Math.PI / 2, y: 0, z: 0 } },
    { ...ellipsoid("mitrale", "Valvola mitrale", "Si trova tra atrio e ventricolo sinistro e ostacola il ritorno del sangue verso l'atrio.", "#f3acb2", { x: 0.5, y: 0.05, z: -0.2 }, { x: 0.28, y: 0.28, z: 0.28 }), shape: "ring", rotation: { x: Math.PI / 2, y: 0, z: 0 } },
    { ...ellipsoid("polmonare", "Valvola polmonare", "Regola l'uscita dal ventricolo destro verso l'arteria polmonare e limita il reflusso.", "#a9c8ec", { x: -0.1, y: 0.3, z: 0.67 }, { x: 0.2, y: 0.2, z: 0.2 }), shape: "ring", rotation: { x: Math.PI / 2, y: 0, z: 0 } },
    { ...ellipsoid("aortica", "Valvola aortica", "Regola l'uscita dal ventricolo sinistro verso l'aorta e limita il reflusso.", "#ffc0b6", { x: 0.5, y: 0.35, z: -0.15 }, { x: 0.21, y: 0.21, z: 0.21 }), shape: "ring", rotation: { x: Math.PI / 2, y: 0, z: 0 } },
  ],
};
