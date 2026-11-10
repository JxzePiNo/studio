export type StudyLevel = "triennale" | "magistrale" | "ciclo-unico";
export type StudyProgram = { label: string; area: string; level: StudyLevel };

export const STUDY_LEVEL_LABELS: Record<StudyLevel, string> = {
  triennale: "Laurea triennale", magistrale: "Laurea magistrale", "ciclo-unico": "Laurea magistrale a ciclo unico",
};

// Broad, human-friendly suggestions informed by MUR degree areas, not a registry
// of university courses or a claim of complete/current coverage of degree classes.
// Course names and availability vary by university; custom entries are accepted.
export const STUDY_PROGRAM_SOURCES = [
  "https://www.mur.gov.it/it/atti-e-normativa/decreto-ministeriale-n-1648-del-19-12-2023",
  "https://www.mur.gov.it/it/atti-e-normativa/decreto-ministeriale-n-1649-del-19-12-2023",
] as const;

const areas: Record<StudyLevel, string[]> = {
  triennale: [
    "Informatica", "Scienze dell'educazione e della formazione", "Psicologia", "Ingegneria meccanica",
    "Biotecnologie", "Beni culturali", "Discipline delle arti, della musica e dello spettacolo", "Design", "Economia e commercio",
    "Economia aziendale", "Scienze del turismo", "Filosofia", "Fisica", "Geografia", "Lettere", "Lingue e culture moderne",
    "Mediazione linguistica", "Matematica", "Scienze biologiche", "Chimica", "Chimica industriale", "Scienze geologiche",
    "Scienze naturali", "Scienze ambientali", "Scienze agrarie", "Scienze forestali", "Scienze e tecnologie alimentari",
    "Scienze zootecniche", "Scienze e tecnologie farmaceutiche", "Scienze motorie", "Scienze politiche", "Relazioni internazionali",
    "Sociologia", "Servizio sociale", "Scienze della comunicazione", "Scienze dei servizi giuridici", "Storia", "Statistica",
    "Scienze dell'architettura", "Ingegneria civile", "Ingegneria ambientale", "Ingegneria edile", "Ingegneria informatica",
    "Ingegneria elettronica", "Ingegneria elettrica", "Ingegneria delle telecomunicazioni", "Ingegneria gestionale",
    "Ingegneria aerospaziale", "Ingegneria biomedica", "Ingegneria chimica", "Ingegneria energetica", "Ingegneria dei materiali",
    "Ingegneria navale", "Urbanistica e pianificazione territoriale", "Scienze della difesa e della sicurezza", "Scienze gastronomiche",
    "Scienza dei materiali", "Infermieristica", "Ostetricia", "Fisioterapia", "Logopedia", "Ortottica e assistenza oftalmologica",
    "Terapia occupazionale", "Terapia della neuro e psicomotricità dell'età evolutiva", "Educazione professionale",
    "Tecnica della riabilitazione psichiatrica", "Tecniche di laboratorio biomedico", "Tecniche di radiologia medica",
    "Tecniche di neurofisiopatologia", "Tecniche audiometriche", "Tecniche audioprotesiche", "Tecniche ortopediche",
    "Tecniche di fisiopatologia cardiocircolatoria e perfusione cardiovascolare", "Igiene dentale", "Dietistica",
    "Tecniche della prevenzione nell'ambiente e nei luoghi di lavoro", "Assistenza sanitaria",
    "Professioni tecniche per l'edilizia e il territorio", "Professioni tecniche agrarie, alimentari e forestali",
    "Professioni tecniche industriali e dell'informazione",
  ],
  magistrale: [
    "Informatica", "Sicurezza informatica", "Data science", "Intelligenza artificiale", "Psicologia", "Scienze pedagogiche",
    "Programmazione e gestione dei servizi educativi", "Scienze dell'educazione degli adulti e della formazione continua",
    "Teorie e metodologie dell'e-learning e della media education", "Antropologia culturale ed etnologia", "Archeologia",
    "Architettura del paesaggio", "Architettura", "Archivistica e biblioteconomia", "Biologia", "Biotecnologie agrarie",
    "Biotecnologie industriali", "Biotecnologie mediche, veterinarie e farmaceutiche", "Conservazione dei beni architettonici e ambientali",
    "Conservazione e restauro dei beni culturali", "Design", "Economia", "Economia aziendale", "Finanza", "Statistica",
    "Scienze statistiche attuariali e finanziarie", "Filologia moderna", "Filologia, letterature e storia dell'antichità",
    "Filosofia", "Fisica", "Geografia", "Informazione e sistemi editoriali", "Ingegneria aerospaziale", "Ingegneria biomedica",
    "Ingegneria chimica", "Ingegneria civile", "Ingegneria dei sistemi edilizi", "Ingegneria dell'automazione",
    "Ingegneria della sicurezza", "Ingegneria delle telecomunicazioni", "Ingegneria elettrica", "Ingegneria elettronica",
    "Ingegneria energetica e nucleare", "Ingegneria gestionale", "Ingegneria informatica", "Ingegneria meccanica",
    "Ingegneria navale", "Ingegneria per l'ambiente e il territorio", "Ingegneria dei materiali", "Lingue e letterature moderne",
    "Lingue per la comunicazione internazionale", "Linguistica", "Matematica", "Metodologie informatiche per le discipline umanistiche",
    "Musicologia e beni musicali", "Organizzazione e gestione dei servizi per lo sport", "Pianificazione territoriale e urbanistica",
    "Progettazione e gestione dei sistemi turistici", "Relazioni internazionali", "Scienze agrarie", "Scienze alimentari",
    "Scienze forestali e ambientali", "Scienze e tecnologie per l'ambiente e il territorio", "Scienze della comunicazione pubblica",
    "Scienze della comunicazione d'impresa", "Scienze della natura", "Scienze della nutrizione umana", "Scienze dello spettacolo",
    "Scienze delle pubbliche amministrazioni", "Scienze della politica", "Scienze della difesa e della sicurezza", "Scienze delle religioni",
    "Scienze economiche per l'ambiente e la cultura", "Scienze geofisiche", "Scienze geologiche", "Scienze chimiche", "Chimica industriale",
    "Scienze storiche", "Scienze zootecniche", "Servizio sociale e politiche sociali", "Sociologia e ricerca sociale", "Storia dell'arte",
    "Traduzione specialistica e interpretariato", "Scienze dello sviluppo e della cooperazione internazionale",
    "Scienze delle attività motorie preventive e adattate", "Scienze e tecniche dello sport", "Scienze e tecnologie della navigazione",
    "Scienze e tecnologie spaziali", "Scienze e tecnologie per il patrimonio culturale", "Scienze geografiche", "Scienze dei materiali",
    "Scienze economiche e sociali della gastronomia", "Scienze giuridiche", "Tecniche e metodi per la società dell'informazione",
    "Scienze infermieristiche e ostetriche", "Scienze riabilitative delle professioni sanitarie",
    "Scienze delle professioni sanitarie tecniche diagnostiche", "Scienze delle professioni sanitarie tecniche assistenziali",
    "Scienze delle professioni sanitarie della prevenzione", "Scienze e tecnologie animali", "Scienze viticole ed enologiche",
    "Scienze e tecnologie della produzione multimediale", "Tecniche della conservazione dei beni culturali",
  ],
  "ciclo-unico": [
    "Medicina e chirurgia", "Odontoiatria e protesi dentaria", "Medicina veterinaria", "Farmacia",
    "Chimica e tecnologia farmaceutiche", "Giurisprudenza", "Scienze della formazione primaria",
    "Architettura", "Ingegneria edile-architettura", "Conservazione e restauro dei beni culturali",
  ],
};

export function normalizeStudyProgram(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("it").replace(/[^a-z0-9]+/g, " ").trim();
}

export const STUDY_PROGRAMS: StudyProgram[] = Object.entries(areas).flatMap(([level, values]) => values.map(area => ({
  label: `${STUDY_LEVEL_LABELS[level as StudyLevel]} in ${area}`, area, level: level as StudyLevel,
})));

export function searchStudyPrograms(query: string, level: StudyLevel | "all" = "all"): StudyProgram[] {
  const words = normalizeStudyProgram(query).split(" ").filter(Boolean);
  return STUDY_PROGRAMS.filter(program => (level === "all" || program.level === level) && words.every(word => normalizeStudyProgram(program.label).includes(word)));
}

export function customStudyProgram(value: string): string | null {
  const trimmed = value.trim();
  return trimmed && trimmed.length <= 300 ? trimmed : null;
}
