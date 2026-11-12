export const tonyPhrases = {
  home: [
    "Io preparo lo spritz… te prepara gli appunti.",
    "Il solito? Un caffè e un esame in meno.",
    "Qui il conto si fa in pagine. Il coperto lo offro io.",
    "Tu porta gli appunti. Al ghiaccio ci penso io.",
    "Oggi abbiamo un obiettivo: far diventare quel capitolo una cosa già vista.",
    "Ho messo in fresco le distrazioni. Apriamo un esame?",
    "Il programma è lungo, ma anche l'aperitivo si fa un sorso alla volta.",
    "Al bancone c'è posto. Appoggia pure quel PDF da seicento pagine.",
    "Tony Pitony cerca una hit. Noi cerchiamo il capitolo giusto da cui partire.",
    "Se i tuoi appunti avessero un ritornello, lo sapresti già a memoria.",
    "Prima un concetto chiaro. Poi possiamo anche parlare del tour.",
    "Oggi niente cocktail complicati: un argomento, una pausa, si riparte.",
    "Il caffè è corto. La lista degli esami la accorciamo insieme.",
    "La sessione non finisce da sola. Lo spritz, invece, stranamente sì.",
    "Crea un esame e aggiungi i PDF: al resto pensiamo insieme.",
    "La griglia dei giorni racconta le pagine che hai studiato.",
  ],
  course: [
    "Io preparo lo spritz… te prepara le slide.",
    "Un PDF sul bancone, grazie. Senza ghiaccio, che si bagnano gli appunti.",
    "Questa materia la serviamo un capitolo alla volta.",
    "Tu scegli il prossimo argomento. Io tengo caldo il caffè.",
    "Se questo corso fosse un cocktail, avremmo già tutti gli ingredienti.",
    "Qui si mescolano idee. Gli esami, meglio tenerli nelle loro cartelle.",
    "Puoi analizzare i PDF e continuare a girare per Studio.",
    "Tasto destro su un file: puoi segnare un intervallo di pagine già lette.",
    "Anche due esami possono essere analizzati contemporaneamente.",
  ],
  sessions: [
    "Pulisco il bancone e facciamo il conto delle pagine.",
    "Queste sono le ricevute dello studio. Tienile: valgono più degli scontrini.",
    "Una sessione alla volta. Stai mettendo su un bel repertorio.",
    "Avvia il timer quando studi: ritroverai qui la sessione.",
    "Tasto destro sulle sessioni per unirle o eliminarle.",
    "Clicca un giorno nella griglia per rivedere la tua attività.",
  ],
  reader: [
    "Un caffè e una pagina alla volta.",
    "Premi Spazio per segnare la pagina come letta o da leggere.",
    "Dalla chat puoi chiedermi un quiz sugli argomenti del PDF.",
  ],
  loading: [
    "Io preparo lo spritz… te prepara gli appunti.",
    "Appoggio il vassoio e ti porto il PDF.",
    "Un attimo: sto facendo spazio sul bancone.",
    "Il ghiaccio è pronto. Manca solo il tuo materiale.",
    "Queste pagine non si sfogliano da sole. Arrivo.",
    "Accendo le luci sul palco. Il protagonista è il tuo PDF.",
    "Il PDF entra, le distrazioni restano fuori.",
    "Sto cercando un sottobicchiere abbastanza grande per questi appunti.",
    "Tolgo il grembiule da barista e metto quello da tutor.",
    "Se senti uno shaker, sono le idee che si stanno sistemando.",
    "Preparo il tavolo: oggi il piatto forte è questo capitolo.",
    "Tony Pitony al soundcheck, io al controllo delle pagine.",
  ],
  upload: [
    "Tu carica gli appunti. Io carico di ghiaccio lo spritz.",
    "Sto portando i tuoi appunti al tavolo.",
    "Un PDF alla volta, senza rovesciare il vassoio.",
    "Cercando nei tuoi appunti il titolo della prossima hit… magari con Tony Pitony.",
    "Se spunta un ritornello tra gli appunti, avviso Tony Pitony.",
    "Il featuring con Tony Pitony per ora è nella mia testa. Il PDF sta arrivando.",
    "Questi appunti pesano. Per fortuna oggi non li porto a mano.",
    "Io tengo il posto al bancone. Tu puoi continuare a girare.",
    "Sto allungando il tavolo, non il caffè.",
    "I tuoi file stanno entrando. Ho già detto loro di fare piano.",
    "Dal tuo computer al mio bancone. Poi si studia.",
    "Per questi appunti serve un vassoio, non un sottobicchiere.",
  ],
} satisfies Record<string, readonly string[]>;

export type TonyPhraseContext = keyof typeof tonyPhrases;
export type PhraseDeck = { remaining: string[]; last?: string };

/** Consume a shuffled deck before repeating, including across deck boundaries. */
export function takeTonyPhrase(context: TonyPhraseContext, previous?: PhraseDeck, random = Math.random) {
  const phrases: readonly string[] = tonyPhrases[context];
  const remaining = [...new Set(previous?.remaining ?? [])].filter(phrase => phrases.includes(phrase));
  if (!remaining.length) {
    remaining.push(...phrases);
    for (let index = remaining.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1));
      [remaining[index], remaining[other]] = [remaining[other], remaining[index]];
    }
    if (remaining.at(-1) === previous?.last && remaining.length > 1) [remaining[0], remaining[remaining.length - 1]] = [remaining[remaining.length - 1], remaining[0]];
  }
  const phrase = remaining.pop()!;
  return { phrase, deck: { remaining, last: phrase } };
}
