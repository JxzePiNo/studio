# Margine

**Workspace di studio con tutor AI per organizzare PDF, comprendere le slide e pianificare la preparazione degli esami.**

Applicazione full stack sviluppata con **Next.js, React e TypeScript**, con persistenza locale oppure **Firebase**, analisi concorrente dei materiali e una suite di test unitari, di integrazione ed end-to-end.

Il login presenta **Tony**, la mascotte animata, su uno sfondo a puntini, con accesso Google e animazioni rispettose delle preferenze di movimento. L'analisi prosegue durante la navigazione nell'app: un indicatore flottante mostra avanzamento e stato, permette di interromperla e si può nascondere o riaprire. La scheda del browser deve restare aperta.

Tony accompagna anche il nome Studio nella sidebar. La home saluta l'utente con il nome Google e alterna frasi dedicate a esami, sfide e scoperte, mantenendo stabile lo spazio del titolo.

Il saluto resta su una riga adattando la dimensione del testo. Il dettaglio dei file in analisi parte chiuso; aprirlo non allunga il componente di caricamento. Il riepilogo flottante mostra subito le pagine segnate come lette oggi, un cronometro e i progressi del PDF aperto. Nascondere il riepilogo non arresta il timer. Il cronometro attivo viene conservato nel browser; fermandolo, la sessione con durata e pagine per PDF viene salvata nell'account Firebase oppure nell'archivio locale. Le scritture dello storico vengono accodate e possono essere ritentate in caso di errore.

La home mostra una griglia degli ultimi 365 giorni con intensità verde proporzionale alle pagine lette. Selezionare un giorno apre **Sessioni di studio**, accessibile anche dalla sidebar, con filtro per data e statistiche. Dal menu di un PDF si può registrare un intervallo già letto, indicando facoltativamente un periodo passato per distribuirne le pagine nel calendario. Ripetere lo stesso import non duplica le pagine dello stesso giorno.

L'apertura passa immediatamente al lettore e mostra **Tony del bar** con frasi da barista mentre il PDF arriva. Uscire durante il caricamento annulla la richiesta senza riaprire il documento in seguito. Anche i salvataggi già avviati continuano tornando ai materiali.

Le richieste della chat continuano durante la navigazione interna: una notifica segnala la risposta pronta e riapre PDF e pagina corrispondenti. La scheda deve restare aperta; la conversazione completata viene salvata con la pagina.

I controlli **occhio · notifiche** restano affiancati al centro in alto. Il riepilogo della sessione non è trascinabile ed è ancorato all'occhio; la campanella apre un popup allineato al proprio pulsante con Tony, il suo messaggio e gli aggiornamenti. Le nuove notifiche aggiornano il badge senza aprire il popup automaticamente.

I caricamenti continuano mentre navighi fra corsi, sessioni e PDF. Ogni file conserva il corso scelto quando è stato aggiunto; puoi accodare altri file, leggere materiali già disponibili e avviare analisi indipendenti. Una Dynamic Island mostra il lavoro attivo e apre il dettaglio nelle notifiche. L'avanzamento di trasferimento deriva dagli eventi reali di invio dei byte, sia verso Storage sia nell'upload locale; preparazione e verifica/salvataggio sono fasi separate con avanzamento indeterminato. Il completamento non chiude il PDF che stai leggendo. Ricaricare o chiudere la scheda interrompe i lavori ancora in corso e il browser avvisa della loro presenza.

Per le pagine PDF verticali le frecce sono ai lati del lettore; sotto **Torna al corso** compaiono **Completata** e il suggerimento per Spazio, centrati rispetto al pulsante superiore. Il pulsante segna la pagina come letta e passa alla successiva. La disposizione originale resta per le pagine orizzontali, anche nei PDF che alternano orientamenti. La barra laterale di scorrimento del PDF è nascosta; rotella, trackpad e swipe mantengono la navigazione.

Il pulsante **Crea**, accanto a Quiz e Tutto PDF, apre tre opzioni: **Mappe**, **Immagini**, **Schemi**. La generazione considera il corso, il PDF selezionato e le domande precedenti. Mappe mentali e schemi usano React Flow e Dagre: zoom, spostamento, rami richiudibili, spiegazioni dei concetti, modifica dei testi e della disposizione, schermo intero ed esportazione SVG. Le immagini sono illustrazioni generate con punti selezionabili, spiegazioni e posizioni correggibili. I materiali e le modifiche salvate rimangono nella chat; i PNG sono file privati separati, scaricabili soltanto tramite l'API autenticata. La finestra include una mappa gratuita del cuore e richieste di esempio per le tre modalità. I precedenti modelli 3D salvati restano leggibili.

La generazione di immagini usa `OPENAI_IMAGE_MODEL` (predefinito `gpt-image-2`) e richiede un account OpenAI abilitato al modello. `OPENAI_MODEL` governa mappe, schemi e analisi dei punti interattivi. Le illustrazioni generate possono contenere imprecisioni: le note e le spiegazioni vanno confrontate con il materiale del corso.

In **Crea**, il suggerimento «Una mappa di tutto il PDF» prepara una richiesta pronta e seleziona esplicitamente l'intero documento. Ogni modalità offre un prompt già compilato con il nome del PDF; la guida opzionale lo adatta a obiettivo (comprensione, esame, collegamenti) e profondità (panoramica, approfondimento, definizioni). Il testo resta modificabile e la generazione parte soltanto premendo **Genera**. I nodi delle nuove mappe e degli schemi possono riportare la pagina fisica in cui il concetto viene definito: cliccarli apre quella pagina e **Torna alla mappa** riporta alla conversazione originale. Il server rifiuta riferimenti fuori dal PDF e rimappa correttamente gli allegati di una sola pagina; i nodi di sintesi possono essere privi di una fonte specifica. Le vecchie mappe senza riferimenti restano leggibili.

La dashboard **Admin** è disponibile in `/admin` e nel menu account per `paolucciacopo@gmail.com` con email verificata. Richiede Firebase: tutte le API verificano token e revoche lato server. Elenca gli utenti Firebase con paginazione e ricerca per email, file e dimensioni, profilo e accessi, consumi AI, domande, conversazioni, analisi, quiz e dati di studio. Permette sospensione/riattivazione, revoca delle sessioni, modifica del nome, note e blocchi delle funzionalità per utente, oltre a manutenzione, interruttori globali e gestione soprannomi. Gli interruttori sono applicati dalle API, anche per i quiz richiesti tramite chat. Le operazioni admin vengono registrate.

Il monitoraggio AI salva i token effettivamente riportati dal provider (input, cache, output), modello, funzione, durata ed esito, comprese risposte incomplete e streaming. Non ricostruisce i consumi storici: le chiamate senza usage sono indicate esplicitamente. Le stime USD dipendono dalle tariffe per milione di token configurate dall'admin; non sono fatture. Domande e richieste vengono registrate separatamente dalla cronologia limitata della chat. Gli elenchi e le esportazioni admin indicano i dati caricati e offrono paginazione per utenti, file, richieste e pagine dei documenti.

**Inviti e saluti** raccoglie i link referral personali e le persone entrate dopo l'accesso Google. Ogni persona viene associata al primo invito e può ricevere un saluto personale, consegnato da Tony nella sua chat di benvenuto. Aprire il messaggio non lo segna subito come letto: serve un tempo di lettura con schermata visibile, oppure il pulsante **Ho letto**. Cambiare schermata, passare in background o scegliere **Leggi più tardi** lascia il saluto in attesa.

Su desktop Tony resta in basso a sinistra nell'area principale della home. Dentro un corso passa nella sidebar solo se c'è spazio, subito sopra Account: mascotte a sinistra e fumetto a destra. Con molti esami o una finestra più bassa resta nell'area principale, lasciando scorrere l'elenco.

Su mobile le schermate principali usano il menu inferiore **Home · Sessioni · Inviti · Account** e non mostrano la mascotte. Aprendo un PDF, il lettore occupa tutto lo schermo con la pagina centrata verticalmente; Tony è trascinabile e un tocco apre o chiude la chat nella metà inferiore, conservando la bozza. Il numero della pagina è modificabile: Invio conferma lo spostamento, Escape annulla e i valori fuori intervallo vengono segnalati.

Nel lettore la rotella del mouse e gli swipe verticali cambiano pagina. Quando il PDF è ingrandito, prima scorrono la pagina corrente e passano alla successiva soltanto al bordo. La chat e i materiali interattivi mantengono lo scorrimento e i gesti indipendenti.

Dal pulsante **Quiz** del lettore puoi scegliere il quiz rapido sulle pagine dalla prima a quella aperta oppure personalizzare da 1 a 30 domande, tipi e argomenti. Il rapido chiede prima se usare un timer: per domanda (60 secondi iniziali, modificabili), totale (un minuto per domanda come valore iniziale, modificabile) o nessun timer. Le stesse opzioni sono nel modulo personalizzato. La difficoltà iniziale è alta, calibrata sul percorso di studi e sulla materia; per le materie STEM resta alta anche quando la configurazione arriva da chat o API. Le domande avanzate privilegiano applicazioni, ragionamento e alternative plausibili, sempre entro le pagine selezionate. Il quiz personalizzato usa l'intero PDF se non si restringono gli argomenti. I quiz vengono salvati come elementi del PDF; tentativo e timer sono conservati nel browser. Il timer per domanda si ferma durante la correzione e riparte con la domanda successiva; quello totale continua anche durante le correzioni. Alla scadenza si conferma la risposta presente o si consegna il quiz; chiudere o ricaricare non azzera il tempo. I quiz precedenti senza configurazione del timer restano senza tempo. Le domande chiuse hanno un punteggio automatico, quelle aperte una risposta di riferimento. La generazione usa le [risposte strutturate OpenAI](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).

Le sessioni con timer supportano selezione multipla e azioni dal tasto destro: eliminazione e aggregazione con conferma. I gruppi conservano il periodo, uniscono le pagine distinte e contano una sola volta i tempi sovrapposti; il calendario delle letture resta indipendente. Le cartelle e la sidebar riprendono il linguaggio visivo di ArchAIve, con accenti principali blu. Le schede mostrano nome del corso, data, CFU facoltativi, giorni rimanenti e carico giornaliero; le parole significative del nome hanno l'iniziale maiuscola, mentre articoli, congiunzioni e preposizioni restano minuscoli. Le impostazioni raccolgono pianificazione, colore, CFU, archiviazione reversibile ed eliminazione confermata dei materiali. La home permette di cercare gli esami ignorando accenti e maiuscole e ordinarli per scadenza, nome o creazione. Home e pagina del corso condividono larghezza e spazi laterali; il fondo combina puntini e riquadri azzurri sfumati ispirati alla reference fornita.

La mascotte riutilizza il renderer Onee distribuito con licenza **AGPL-3.0-only**; attribuzione e riferimenti in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Il progetto esplora problemi concreti di software engineering: gestione della concorrenza, consistenza dei salvataggi, invalidazione della cache, integrazione con un servizio AI e progettazione di un'interfaccia di lettura accessibile.

> **Sviluppo assistito dall'AI:** Margine è stato realizzato attraverso un approccio di **vibe coding**, utilizzando assistenti generativi per implementazione, refactoring e sviluppo dei test. Requisiti, priorità del prodotto e criteri di accettazione sono stati definiti dall'autore. Il codice prodotto con l'AI viene verificato attraverso controlli di tipo, test automatici e verifiche dell'interfaccia. La responsabilità delle scelte tecniche e del risultato rimane dell'autore.

## Il problema

Preparare un esame richiede spesso di passare continuamente tra slide, appunti, spiegazioni e calendario. Margine riunisce queste attività in uno spazio organizzato per materia, mantenendo il contesto della pagina che si sta studiando.

Le spiegazioni generate e i progressi di lettura sono dati distinti: una pagina analizzata dall'AI non viene considerata automaticamente studiata.

## Funzionalità

- **Organizzazione per esame:** cartelle, caricamento multiplo di PDF, rinomina, ordinamento dei materiali e collegamenti diretti a esami e documenti.
- **Lettore PDF con tutor affiancato:** zoom, schermo intero, navigazione da tastiera e divisore trascinabile per ridimensionare, chiudere e riaprire la chat, anche su mobile.
- **Spiegazioni contestuali:** analisi della pagina con concetti chiave, esempi, formule, glossario inglese-italiano e richieste di approfondimento.
- **Chat per pagina:** conversazioni persistenti, contesto della slide oppure dell'intero PDF aperto, risposte Markdown, tabelle, formule LaTeX e codice evidenziato con copia negli appunti.
- **Analisi di più materiali:** tutti i file con pagine mancanti partono automaticamente in parallelo. Ogni PDF ha una richiesta concorrente per ogni gruppo di dieci pagine, con almeno quattro lavori sui file piccoli (o meno se le pagine mancanti sono meno di quattro). Su 700 pagine partono 70 richieste, ciascuna su una pagina; i primi invii sono 1, 11, 21 e così via. La dimensione del documento originale determina la capacità anche durante la ripresa; le pagine già salvate vengono saltate. I worker liberi prendono la prossima pagina senza duplicati. Non è imposto un tetto globale al numero di documenti o pagine in lavorazione: otto file possono avere 32 pagine attive. Puoi avviare più esami con avanzamento e arresto separati; l'arresto e gli errori attendono il salvataggio delle richieste già in corso. I PDF restano apribili durante l'analisi.
- **Limiti reali dell'analisi:** OpenAI applica limiti per modello/progetto, principalmente richieste e token per minuto, visibili nella [pagina Limits](https://platform.openai.com/settings/organization/limits). Gli errori temporanei rispettano `Retry-After` e, in caso di quota di velocità esaurita, i tempi di reset comunicati negli header. Una pausa condivisa nella scheda sospende le nuove richieste di analisi, anche di altri corsi, mentre le richieste già inviate possono terminare. Non coordina altre schede o istanze server. Il numero massimo di tentativi per pagina resta tre. La velocità dipende anche da rete, CPU e memoria del server e latenza del modello: il guadagno proporzionale al parallelismo è teorico, non garantito. Un PDF viene inviato a OpenAI una pagina alla volta; i limiti dei [file di input](https://developers.openai.com/api/docs/guides/file-inputs) sono distinti dal limite di upload di Studio.
- **Tracciamento dello studio:** appunti con salvataggio automatico, pagine lette tramite pulsante o barra spaziatrice, bordo verde pastello e documento considerato letto dal 95% delle pagine. Badge separati indicano lo stato dell'analisi AI.
- **Pianificazione:** data dell'esame, ritmo di studio, stima del carico giornaliero, giorni di pausa ricorrenti e singole date escluse, riutilizzabili da un altro esame.
- **Profilo di studio:** percorso universitario o ambito disciplinare utilizzato per contestualizzare le nuove spiegazioni.

## Stack tecnologico

| Area | Tecnologie |
| --- | --- |
| Frontend | Next.js 16, React 19, TypeScript |
| UI | Componenti locali basati su primitive Radix UI, CSS con design token, Lucide, React DayPicker |
| Backend | Node.js, Next.js Route Handlers, validazione con Zod |
| PDF | PDF.js per il rendering nel browser; pdf-lib per validazione ed estrazione delle pagine sul server |
| AI | OpenAI SDK e Responses API; output strutturati e validazione delle spiegazioni con Zod |
| Markdown | react-markdown, remark-gfm, remark-math, KaTeX e rehype-highlight |
| Persistenza locale | File JSON e PDF su filesystem; scritture serializzate e sostituzione atomica dei metadati |
| Persistenza cloud | Firebase Authentication con Google, Cloud Firestore, Cloud Storage e Firebase Admin SDK |
| Cache | Cache in memoria con TTL, politica LRU, limiti di dimensione e controllo delle revisioni |
| Test | Node.js test runner, tsx, Playwright con Chrome |

Le dipendenze effettive sono dichiarate in [package.json](package.json) e risolte in [package-lock.json](package-lock.json).

## Architettura

```mermaid
flowchart LR
    UI["React: esami, lettore PDF.js e chat"] --> API["Route Handlers: validazione e accesso"]
    API --> STORE["Facciata di persistenza"]
    STORE --> CACHE["Cache in memoria: TTL e LRU"]
    STORE --> LOCAL["Filesystem: PDF e JSON"]
    STORE --> CLOUD["Firebase: Firestore e Storage"]
    API --> PDF["Estrazione della pagina: pdf-lib"]
    PDF --> AI["OpenAI: analisi e tutor"]
    AI --> API
```

- [`components/`](components/) contiene interfaccia, composizione del lettore e orchestrazione delle interazioni.
- [`app/api/`](app/api/) espone gli endpoint e gestisce validazione, autenticazione ed errori.
- [`lib/`](lib/) contiene persistenza, cache, integrazione AI e funzioni di dominio, come pianificazione e ordinamento dei materiali.
- [`tests/`](tests/) verifica logica, persistenza e integrazioni simulate; [`e2e/`](e2e/) verifica i percorsi nel browser.

Il dettaglio delle decisioni, dei limiti e dei punti di estensione è in [Architettura e scelte progettuali](docs/ARCHITECTURE.md).

### Principi SOLID

L'applicazione dei principi è documentata rispetto al codice attuale, comprese le aree ancora da consolidare.

| Principio | Applicazione nel progetto |
| --- | --- |
| **Single Responsibility** | Pianificazione, ordinamento, cache e concorrenza sono separati in moduli dedicati. Il coordinamento in `Workspace` resta un candidato a ulteriori estrazioni. |
| **Open/Closed** | Cache generica e worker pool ricevono configurazione e callback. Aggiungere un nuovo backend di persistenza richiederebbe ancora modifiche alla selezione esplicita in `store.ts`. |
| **Liskov Substitution** | Le modalità locale e cloud espongono operazioni applicative analoghe; la loro sostituibilità completa richiede una futura interfaccia comune e test contrattuali per entrambi i backend. |
| **Interface Segregation** | Componenti e utility espongono props e funzioni mirate: disponibilità di studio, divisore del lettore, cache e ordinamento hanno contratti distinti. |
| **Dependency Inversion** | I Route Handlers accedono ai documenti attraverso la facciata di persistenza. L'iniezione dei provider storage e AI tramite interfacce esplicite è un passo successivo; gli import attuali sono ancora concreti. |

### Pattern e tecniche presenti

- **Facade e adattamento del provider:** `lib/store.ts` offre un punto di accesso ai documenti; `lib/cloud-store.ts` traduce le operazioni applicative in chiamate Firebase.
- **Cache-aside:** le letture riutilizzano snapshot compatibili con la revisione corrente, altrimenti caricano i dati dalla persistenza. La fonte persistente rimane autorevole.
- **Worker pool e coordinamento per esame:** `runParallelFiles` avvia un worker asincrono per ogni file da elaborare; `useCourseAnalysis` conserva lavori e controlli di arresto distinti per esame. In caso di arresto o errore attende le operazioni già avviate nel lavoro interessato prima di terminarlo.
- **Coda di scrittura per documento:** le modifiche locali dello stesso documento vengono serializzate; la sostituzione atomica evita di pubblicare un JSON scritto solo parzialmente.
- **Composizione e Context in React:** componenti specializzati compongono il workspace; i provider condividono stato del profilo e della sidebar.

## Avvio locale

Ambiente di riferimento: **Node.js 22.13+**, npm e PowerShell. Gli esempi usano `npm.cmd` per evitare restrizioni di esecuzione degli script PowerShell.

```powershell
npm.cmd ci
Copy-Item .env.example .env.local
npm.cmd run dev
```

Apri [127.0.0.1:3000](http://127.0.0.1:3000). Con `NEXT_PUBLIC_FIREBASE_ENABLED=false` puoi organizzare i PDF, leggere e salvare appunti senza configurare Firebase. Analisi e chat richiedono la chiave AI del server.

Le variabili sono elencate in [.env.example](.env.example):

| Variabile | Funzione |
| --- | --- |
| `OPENAI_API_KEY` | Credenziale server per analisi e chat |
| `OPENAI_MODEL` | Modello utilizzato dalle richieste AI |
| `NEXT_PUBLIC_FIREBASE_ENABLED` | Seleziona modalità locale (`false`) oppure autenticazione e persistenza Firebase (`true`) |
| `NEXT_PUBLIC_FIREBASE_*` | Configurazione dell'app Firebase nel browser |
| `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Credenziali server alternative alle Application Default Credentials |
| `DATA_DIR` | Percorso dei dati locali; se assente viene usata la cartella `data/` |

Le chiavi AI e le credenziali private restano sul server. `.env.local` è escluso dal repository. Dopo una modifica alla configurazione riavvia il server; le variabili pubbliche Firebase richiedono anche una nuova build in produzione.

Per la modalità cloud consulta [Configurazione Firebase](FIREBASE.md).

## Test e verifica

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
```

La suite comprende verifiche su salvataggi concorrenti, invalidazione della cache, isolamento delle copie, pianificazione, riutilizzo delle analisi, arresto dei worker e rendering Markdown. I test browser coprono caricamento, navigazione, chat, progressi di lettura, layout responsive, otto file concorrenti e analisi di più esami con arresto indipendente.

Le richieste AI nei test sono simulate: l'esecuzione della suite non richiede una chiave reale. I test end-to-end usano una build separata in `.next-e2e`, dati in `test-results/e2e-data` e Firebase disabilitato. La configurazione attuale richiede Chrome installato e usa `npm.cmd` per avviare il server di test su Windows.

La verifica contro un progetto Firebase reale e contro il servizio AI è un'attività distinta dai test automatici locali.

## Dati, sicurezza e limiti operativi

In modalità locale, PDF e JSON sono salvati sul computer che esegue il server. I comandi di avvio ascoltano su `127.0.0.1`; questa modalità è pensata per uso personale con una sola istanza sulla stessa cartella dati. Per un backup va conservata l'intera cartella `data/`.

In modalità Firebase, l'accesso passa da API autenticate e i dati sono organizzati sotto l'identificativo dell'utente. Le regole incluse negano l'accesso diretto dal browser a Firestore e Storage; il server usa Firebase Admin SDK.

Le richieste al tutor includono il contesto necessario alla funzione selezionata: pagina corrente oppure PDF completo, spiegazioni disponibili, appunti, cronologia recente e profilo di studio. Le richieste AI hanno `store: false`; il trattamento dei dati resta soggetto alle condizioni del fornitore. Le risposte generate possono contenere errori.

Limiti attuali:

- PDF e immagini **PNG/JPEG** fino a **500 MB** per file. Le immagini vengono convertite in PDF a una pagina. PDF fino a **1.000 pagine**; i documenti protetti da password devono essere sbloccati.
- L'analisi è orchestrata dal browser: occorre mantenere aperta la scheda. La ripresa riutilizza le pagine salvate; non è presente una coda di job durevole lato server.
- La concorrenza dei file è automatica, senza un tetto applicativo di sei: una richiesta di analisi per pagina può essere attiva per ogni file del lavoro. Browser, hosting e provider AI possono comunque accodare o limitare le richieste; non è presente un coordinamento globale distribuito tra schede, utenti o repliche del server.
- La cache server resta locale al processo: TTL di 5 minuti, fino a 16 PDF per 64 MiB e 128 documenti per 16 MiB. Il browser conserva fino a 100 MB in IndexedDB, separati per utente; revisioni ETag e aggiornamenti mirati riducono download e letture Firestore. Durate, invalidazione e limiti sono descritti in [Cache e prestazioni](docs/PERFORMANCE.md).
- Non sono implementati collaborazione in tempo reale, migrazione automatica dei dati locali o rate limiting applicativo distribuito.

## Evoluzioni previste

- Introdurre interfacce per storage e provider AI, con dependency injection e test contrattuali comuni.
- Spostare l'orchestrazione delle analisi in job persistenti per consentire la ripresa indipendente dalla sessione del browser.
- Aggiungere CI, test dei servizi cloud in un ambiente dedicato e misure di latenza e utilizzo delle risorse.
- Valutare una cache condivisa quando un deployment con più istanze ne dimostri la necessità.

L’analisi riprova automaticamente gli errori temporanei fino a 3 tentativi per pagina, con attese di 2 e 5 secondi. Le spiegazioni completate restano salvate. Errori di configurazione, quota esaurita e rifiuti espliciti non vengono ritentati.
