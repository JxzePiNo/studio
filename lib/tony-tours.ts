export const tourSections = ["home", "course", "reader"] as const;
export type TourSection = typeof tourSections[number];
export type TourSeen = Record<TourSection, boolean>;
export const tourLabels: Record<TourSection, string> = { home: "Home", course: "Esame", reader: "Lettore PDF" };
export function normalizeTourSeen(value: unknown): TourSeen {
  const saved = value && typeof value === "object" ? value as Partial<TourSeen> : {};
  return { home: saved.home === true, course: saved.course === true, reader: saved.reader === true };
}

export type TonyTourStep = { id: string; target: string; title: string; text: string; optional?: boolean; prepare?: "chat" | "glossary" | "material-menu" | "material-open"; action?: "open-pdf" };
export const tonyTours: Record<TourSection, TonyTourStep[]> = {
  home: [
    { id: "create", target: ".exam-overview-heading button", title: "Partiamo da un nuovo esame", text: "Da qui crei una materia: scegli nome, data d’esame e giorni di pausa. Poi potrai aggiungere i suoi PDF." },
    { id: "navigation", target: ".sidebar-study-nav, .mobile-bottom-navigation", title: "Le sezioni di Studio", text: "Home raccoglie le materie. Calendario distribuisce lo studio giorno per giorno; Sessioni mostra il lavoro svolto; Amici ti mette in contatto con gli altri studenti." },
    { id: "exams", target: '.sidebar-exams-home, [data-tour="exams"]', title: "I tuoi esami", text: "Da questa sezione ritrovi tutte le materie. Sul computer puoi aprire direttamente le cartelle elencate nella barra laterale." },
    { id: "account", target: '[data-tour="account"]', title: "Il tuo account", text: "Qui modifichi profilo e tema. Se ti serve un ripasso dei comandi, puoi rifare ciascun tour dalla sezione Tour di Tony." },
  ],
  course: [
    { id: "actions", target: '[data-tour-material-menu] [data-tour-action="study-inclusion"]', title: "Escludi dalle statistiche", text: "Ti ho aperto i tre puntini. Da questa voce lasci il PDF come consultazione: le sue pagine non pesano su statistiche e calendario. Puoi reincluderlo quando vuoi.", prepare: "material-menu" },
    { id: "read-pages", target: '[data-tour-material-menu] [data-tour-action="read-pages"]', title: "Segna le pagine già studiate", text: "Hai già studiato una parte del materiale? Qui puoi segnare un intervallo di pagine come letto, anche distribuendolo su date passate.", prepare: "material-menu" },
    { id: "delete-file", target: '[data-tour-material-menu] [data-tour-action="delete-file"]', title: "Elimina un PDF", text: "Questa voce elimina il file e i suoi appunti, spiegazioni e quiz. Prima di farlo ti chiederò conferma. Per conservarlo senza conteggiarlo, usa invece l’esclusione dalle statistiche.", prepare: "material-menu" },
    { id: "open-file", target: ".material-open", title: "Clicca per aprire il PDF", text: "Ora clicca sul nome del materiale per aprirlo e iniziare a leggere. Oppure premi Apri PDF qui sotto.", prepare: "material-open", action: "open-pdf" },
  ],
  reader: [
    { id: "pages", target: ".reader-toolbar .reader-navigation-island", title: "Sfoglia al tuo ritmo", text: "Usa le frecce per cambiare pagina, oppure inserisci il numero della slide. Puoi usare anche le frecce della tastiera quando non stai scrivendo." },
    { id: "zoom", target: ".reader-toolbar-zoom", title: "Troviamo la misura giusta", text: "Con meno e più cambi lo zoom; la percentuale lo riporta al 100%. Auto adatta il documento allo spazio disponibile." },
    { id: "complete", target: '[data-tour="complete-page"]', title: "Questa l’hai capita!", text: "La spunta segna la pagina come studiata e passa alla successiva. Aggiorna i progressi e riduce il lavoro rimasto nel calendario." },
    { id: "views", target: ".reader-toolbar-views", title: "Fai spazio alla lettura", text: "Puoi ingrandire il PDF o espandere la lettura nascondendo i controlli. Dalle impostazioni personalizzi la lettura e puoi rigenerare l’analisi della pagina." },
    { id: "creations", target: ".chat-reader-actions", title: "Metti alla prova le idee", text: "Quiz ti aiuta a ripassare; Crea prepara mappe, immagini e schemi. Con Tutto PDF fai domande sull’intero documento invece che solo sulla slide.", prepare: "chat" },
    { id: "glossary", target: '.bottom-panel .glossary', title: "Il glossario della slide", text: "Qui trovi termini, formule e concetti utili alla pagina, con pronuncia e significato dei simboli. Puoi aprire e richiudere il pannello dal bordo inferiore.", prepare: "glossary" },
  ],
};
