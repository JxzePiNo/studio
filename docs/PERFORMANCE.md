# Cache e riduzione delle letture

La persistenza autorevole resta Firestore (o i file nella modalità locale). Le cache velocizzano le letture e non sostituiscono il salvataggio sul server.

Le preferenze per mostrare frecce e suggerimenti del lettore sono salvate localmente per UID e PDF, come le altre preferenze di lettura. Si ripristinano dalle impostazioni e non richiedono letture Firestore.

## Operazioni frequenti

- Il salvataggio della posizione legge solo i metadati del PDF. Non interroga la collezione delle slide.
- Lettura e appunti leggono metadati e una sola slide. I contatori sono aggiornati nella stessa transazione e le richieste ripetute non contano due volte la stessa pagina.
- Analisi e chat modificano soltanto la slide interessata, preservando gli altri campi e aggiornando la revisione dei contenuti.
- Le richieste dell'interfaccia usano `Prefer: return=minimal`: i salvataggi non restituiscono tutto il documento o tutta la cronologia. I client precedenti conservano la risposta completa.
- Segnare una pagina letta aggiorna lo stato locale senza ricaricare corsi e materiali. Le analisi ricaricano il catalogo al termine, anche in caso di interruzione o errore, anziché dopo ciascuna pagina.
- L'elenco dei quiz figli richiede metadati e quiz, senza scaricare le slide. I documenti precedenti migrano una tantum i quiz della chat con creazione atomica: le copie canoniche e le eliminazioni già salvate non vengono sovrascritte.

## Browser

`lib/browser-data-cache.ts` gestisce una cache in memoria (16 MB, massimo 24 risposte) e una persistente in IndexedDB (100 MB, massimo 128 elementi). La rimozione degli elementi più vecchi limita lo spazio occupato. La cache persistente contiene dati JSON e PDF, senza token o credenziali.

Le chiavi comprendono l'UID Firebase; le richieste controllano che l'account corrente corrisponda al token utilizzato. La modalità locale usa uno spazio separato. Il provider dell'app viene ricreato quando cambia l'UID.

| Dati | Durata della copia prima della verifica |
| --- | --- |
| Documento con spiegazioni e chat | 15 secondi |
| Materiali, corsi, sessioni, indice quiz | 30 secondi |
| Profilo e soprannomi | 5 minuti |
| PDF originale immutabile | 7 giorni |

Alla scadenza, una nuova richiesta verifica i dati. Le modifiche effettuate dall'interfaccia invalidano o aggiornano le copie interessate senza aspettare il TTL. Una modifica da un altro dispositivo viene rilevata alla successiva richiesta dopo il TTL: questa implementazione non è una sincronizzazione realtime.

I documenti usano ETag basati sulla revisione dei contenuti. Quando la revisione coincide, il server legge un solo documento di metadati e risponde `304`: non rilegge la collezione delle slide e non ritrasmette le spiegazioni. Nome e posizione aggiornati arrivano nei metadati della risposta. Le mutazioni locali possono aggiornare la copia direttamente solo se la revisione precedente coincide, per non nascondere modifiche concorrenti.

Le cancellazioni invalidano le copie note del documento e del PDF. Una risposta `404` elimina anche il PDF dalla cache. Errori, risposte interrotte e dati di una richiesta invalidata durante il caricamento non vengono salvati come nuovi dati validi. IndexedDB non disponibile o pieno non impedisce di usare l'app.

## Server

Le cache esistenti di PDF e contenuti restano limitate e separate per percorso dell'utente. La lettura dei metadati verifica esistenza e stato di cancellazione prima di riusare i contenuti. Profilo e contesto del singolo corso hanno una cache di processo di 30 secondi, invalidata dalle modifiche sulla stessa istanza.

La cache di processo non è condivisa tra istanze Vercel; la verifica della revisione permette alla copia IndexedDB di evitare il download delle slide anche quando una nuova istanza server ha la memoria vuota. Non è necessario Redis per questi benefici.

## Verifiche e limiti

I test verificano il numero di documenti letti dalle operazioni frequenti, l'idempotenza dei contatori, le risposte condizionali, l'isolamento tra percorsi utente e le cancellazioni. I test browser contano download e richieste durante riapertura, reload, scadenza della cache e lettura di una pagina.

Restano ottimizzabili la prima lettura della cronologia (fino a 500 sessioni), le modifiche generiche/bulk e alcune operazioni sui quiz storici. Le verifiche di versione sono letture Firestore fatturabili; un `304` non significa zero letture. Transazioni ritentate e istanze diverse possono aggiungere letture rispetto ai singoli percorsi misurati nei test. Il risparmio economico effettivo va misurato nel progetto Firebase prima e dopo il rilascio.
