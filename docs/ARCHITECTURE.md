# Architettura e scelte progettuali

Questa nota collega le scelte di Margine al codice che le implementa e ai relativi compromessi. La descrizione riguarda il repository attuale: gli obiettivi di evoluzione sono indicati separatamente.

## Confini applicativi

L'applicazione usa Next.js App Router e Route Handlers in un unico progetto. Il rendering dei PDF avviene nel browser con PDF.js; validazione, estrazione delle pagine, persistenza e richieste AI avvengono sul server.

[`Workspace`](../components/workspace.tsx) coordina navigazione, documento aperto, appunti e stato delle operazioni. Componenti come [`ReaderSplit`](../components/reader-split.tsx), [`StudyChat`](../components/study-chat.tsx) e [`StudyAvailability`](../components/study-availability.tsx) gestiscono interazioni specifiche. Il coordinatore rimane esteso: suddividerlo in hook e servizi applicativi è un refactoring utile per rafforzare SRP.

Le funzioni di pianificazione e ordinamento operano su dati tipizzati senza dipendere dalla UI. Questo rende verificabili separatamente regole quali giorni esclusi, ordinamento numerico dei nomi e gestione delle scadenze.

## Persistenza: facciata e adattamento

[`lib/store.ts`](../lib/store.ts) espone lettura, creazione, aggiornamento, elenco e cancellazione dei documenti. La selezione della modalità avviene tramite configurazione:

- **Locale:** filesystem per PDF e metadati JSON.
- **Cloud:** [`lib/cloud-store.ts`](../lib/cloud-store.ts) adatta le operazioni a Firestore e Storage.

Questa separazione riduce la conoscenza dei dettagli di storage nei Route Handlers che gestiscono i documenti. La selezione è ancora un ramo esplicito, con import di implementazioni concrete. Un terzo backend richiederebbe modifiche alla facciata: OCP e DIP sono quindi aree di evoluzione, attraverso un contratto `DocumentStore` e l'iniezione del provider.

Le modalità hanno comportamenti applicativi analoghi, ma l'assenza di una suite contrattuale condivisa impedisce di considerare dimostrata la sostituibilità richiesta da LSP. I test correnti esercitano soprattutto persistenza locale e integrazioni simulate.

## Consistenza delle scritture

In locale, una coda di Promise per identificativo serializza gli aggiornamenti dello stesso documento. Ogni aggiornamento legge i dati persistenti all'interno della coda, applica la modifica, scrive un file temporaneo e sostituisce il JSON di destinazione tramite `rename`.

Questo protegge dalle sovrascritture tra operazioni concorrenti nello stesso processo e dalla visibilità di file parzialmente scritti. Il meccanismo non costituisce un lock distribuito: due processi che condividono la stessa cartella dati non sono un deployment supportato.

In Firebase, gli aggiornamenti usano transazioni. Le pagine sono salvate in una sottocollezione del documento, mentre i metadati aggregati rimangono nel documento principale. La cancellazione segna il documento come in eliminazione prima di rimuovere il PDF e i dati associati; le letture verificano questo stato.

Riferimenti: [`store.ts`](../lib/store.ts), [`cloud-store.ts`](../lib/cloud-store.ts), [`test della persistenza`](../tests/store.test.ts).

## Analisi concorrenti: lavori indipendenti per esame

[`runParallelFiles`](../lib/parallel-analysis.ts) gestisce worker asincroni: ogni worker elabora un file e mantiene sequenziali le pagine di quel file. La UI avvia automaticamente tutti i file con pagine mancanti, senza selettore e senza il precedente tetto di sei file.

[`useCourseAnalysis`](../components/use-course-analysis.ts) mantiene progressi e runtime separati per esame, inclusi controllo di arresto e richieste attive. Si può avviare un secondo esame mentre il primo continua; l'avvio ripetuto dello stesso lavoro e la sovrapposizione sui suoi documenti sono bloccati. L'indicatore globale aggrega l'avanzamento e conserva controlli di arresto per i singoli lavori.

Quando viene richiesto l'arresto, non vengono avviate altre pagine del lavoro interessato. Le richieste già in corso possono concludersi e salvare il risultato; gli altri esami continuano. In caso di errore il pool del singolo esame interrompe l'assegnazione di nuovo lavoro e attende i suoi worker attivi prima di propagare l'errore. La ripresa rilegge i dati salvati e salta le pagine già analizzate.

Il pool è un meccanismo di concorrenza asincrona lato client, non un insieme di thread né una coda persistente lato server: la scheda deve restare aperta. Browser, hosting e provider possono accodare o limitare le richieste effettive; non esiste un coordinamento globale tra più browser o istanze. La rapidità effettiva dipende anche dal servizio esterno: non è assunto un miglioramento lineare al crescere dei worker.

Riferimenti: [`test del pool`](../tests/parallel-analysis.test.ts), [`test browser delle analisi`](../e2e/course-analysis.spec.ts).

## Cache-aside con TTL, LRU e revisioni

[`MemoryCache<T>`](../lib/memory-cache.ts) fornisce una cache generica configurabile per numero di elementi, dimensione stimata, scadenza e sorgente temporale. La politica LRU espelle gli elementi meno recentemente utilizzati; il TTL è assoluto e non viene esteso dalle letture.

La cache persistente del browser, le risposte condizionali e gli aggiornamenti mirati delle slide sono descritti in [Cache e riduzione delle letture](PERFORMANCE.md). Le transazioni del lettore leggono al massimo i metadati e una sola slide, anziché l’intera collezione.

Il livello dei contenuti usa due cache separate per PDF e snapshot dei documenti. Prima di riutilizzare un valore controlla:

1. Esistenza del contenuto e autorizzazione alla lettura.
2. Identità del contenuto: percorso assoluto in locale, percorso dell'utente autenticato in cloud.
3. Compatibilità della revisione: timestamp del file in locale; revisione del contenuto in Firestore.

In cloud i metadati vengono letti anche in caso di cache hit. La revisione dei contenuti permette di riutilizzare le spiegazioni quando cambia soltanto la posizione di lettura. I PDF originali sono trattati come immutabili e vengono ricontrollati rispetto all'esistenza del documento.

Le risposte restituiscono copie degli oggetti e dei buffer: il chiamante non può modificare accidentalmente il valore conservato in cache. Le scritture bypassano la cache e leggono dalla persistenza. La cache è per processo e non richiede Redis; i limiti dei documenti sono stimati dalla dimensione del JSON, non dalla misura esatta dell'heap JavaScript.

Riferimenti: [`content-cache.ts`](../lib/content-cache.ts), [`test della cache`](../tests/memory-cache.test.ts), [`test della persistenza`](../tests/store.test.ts).

## Integrazione AI e confini di fiducia

Gli endpoint validano gli input prima di accedere ai dati. Le spiegazioni delle pagine usano uno schema strutturato, poi validato con Zod; la validità dello schema non certifica la correttezza della spiegazione.

Il contesto didattico distingue istruzioni del tutor, contenuto del PDF, profilo e cronologia. Ogni modalità dichiara il materiale allegato: una pagina oppure il documento aperto. Il contesto testuale e la cronologia sono limitati per contenere dimensione delle richieste e crescita dei dati salvati.

Il rendering delle risposte usa Markdown senza esecuzione di HTML arbitrario, con formule KaTeX e codice evidenziato. I test verificano anche link non sicuri e conservazione della sintassi letterale nei blocchi di codice.

Le credenziali rimangono sul server. In modalità Firebase i token sono verificati e i percorsi dei dati sono distinti per utente. Le regole incluse negano accessi diretti del browser ai dati: il percorso applicativo passa dalle API e dal Firebase Admin SDK.

Riferimenti: [`http.ts`](../lib/http.ts), [`schema.ts`](../lib/schema.ts), [`endpoint chat`](../app/api/documents/[id]/chat/route.ts), [`MarkdownContent`](../components/markdown-content.tsx).

## Verifica e limiti dell'evidenza

I test unitari verificano funzioni di dominio, limiti del pool e della cache. I test di integrazione verificano persistenza e richieste AI con rete simulata. Playwright verifica i percorsi completi su una build isolata con dati di test.

La suite automatica locale non certifica il comportamento di un deployment pubblico, la configurazione IAM di un progetto Firebase reale, la qualità didattica delle risposte o il rispetto delle quote del servizio AI. Per questi aspetti servono ambienti e verifiche dedicate.

I prossimi passi architetturali sono contratti espliciti dei provider, test comuni ai due backend, job persistenti e osservabilità. La descrizione del processo di vibe coding e dell'uso degli assistenti AI è riportata nel [README](../README.md).
