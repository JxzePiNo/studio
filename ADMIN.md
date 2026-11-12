# Dashboard amministrativa

`/admin` usa la sidebar dello spazio Studio, con un menu account condiviso per profilo, tema, ritorno a Studio e uscita. Il server consente l'accesso soltanto all'identità amministrativa Firebase verificata. In modalità locale le API amministrative rimangono disabilitate.

## Collegare i costi OpenAI

1. Nelle impostazioni dell'organizzazione OpenAI crea una **Admin API key** con accesso alla Costs API.
2. Salvala nella variabile **server** `OPENAI_ADMIN_KEY`. La chiave di progetto `OPENAI_API_KEY`, usata per le generazioni, non sostituisce la chiave amministrativa.
3. Per limitare i costi a Studio, imposta `OPENAI_COSTS_PROJECT_ID` all'ID del progetto OpenAI. Senza questa variabile la dashboard mostra e dichiara l'intera organizzazione.

La dashboard legge `GET /v1/organization/costs`, con raggruppamento giornaliero e per voce di costo, seguendo tutte le pagine. Gli importi sono quelli restituiti da OpenAI; le tariffe manuali della sezione Piattaforma rimangono soltanto stime per utente.

Riferimento: [OpenAI Costs API](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/costs).

## Collegare i costi Firebase

La spesa del progetto Firebase viene letta da Google Cloud Billing tramite la sua esportazione BigQuery, usando l'API BigQuery. I dati operativi Firestore non contengono gli importi di fatturazione.

1. In Google Cloud Billing abilita l'esportazione **Standard usage cost** verso un dataset BigQuery. È supportata anche l'esportazione Detailed usage cost. Le esportazioni Pricing e FOCUS non hanno lo schema usato da questa integrazione.
2. Abilita l'API BigQuery nel progetto che contiene il dataset.
3. Concedi all'account di servizio del server `roles/bigquery.jobUser` nel progetto che contiene il dataset e `roles/bigquery.dataViewer` sul dataset di fatturazione. Per leggere i costi non è necessario concedere privilegi di modifica del dataset.
4. Imposta `GOOGLE_CLOUD_BILLING_TABLE` al nome completo della tabella, ad esempio `progetto-billing.costi.gcp_billing_export_v1_XXXXXX_XXXXXX_XXXXXX`.
5. Imposta `GOOGLE_CLOUD_BILLING_LOCATION` alla località del dataset, ad esempio `EU`, `US` o la regione effettiva.

L'autenticazione riutilizza `FIREBASE_CLIENT_EMAIL` e `FIREBASE_PRIVATE_KEY`, oppure Application Default Credentials. La query filtra sempre `project.id` su `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, anche se la tabella contiene altri progetti. Il totale include tutti i servizi Google Cloud di quel progetto, al netto dei crediti esportati, con dettaglio per servizio e giorno UTC. Non si tratta della fattura definitiva: dati tardivi e rettifiche possono modificarla.

Le query usano parametri per progetto e periodo, conservano valute distinte e hanno un limite di 1 GB di dati fatturabili per query. BigQuery può addebitare archiviazione ed elaborazione secondo il piano dell'account. Se il limite è superato, viene mostrato un errore e non un totale parziale.

Riferimenti: [configurare l'esportazione Billing](https://docs.cloud.google.com/billing/docs/how-to/export-data-bigquery-setup), [schema dei costi e crediti](https://docs.cloud.google.com/billing/docs/how-to/export-data-bigquery-tables/standard-usage), [API BigQuery jobs.query](https://docs.cloud.google.com/bigquery/docs/reference/rest/v2/jobs/query).

## Configurazione e aggiornamento

Le variabili sono elencate in `.env.example`: inserisci i valori in `.env.local` per lo sviluppo e nelle variabili server del servizio di deployment per la produzione. Dopo la modifica riavvia il server o esegui un nuovo deployment. Non inserire chiavi nel codice, nelle variabili `NEXT_PUBLIC_*` o nella chat.

La pagina Costi supporta 7, 30 e 90 giorni UTC, incluso il giorno corrente. I riepiloghi vengono conservati in memoria per 5 minuti, per contenere le query ripetute; anche il pulsante Aggiorna rispetta questa cache. La data visualizzata è l'ultima lettura dal fornitore. Il periodo inizia a mezzanotte UTC e termina all'istante della lettura.

OpenAI e Firebase funzionano indipendentemente: un errore o una configurazione mancante non nasconde l'altro fornitore. In assenza di configurazione compare “Da collegare”; una lettura fallita compare come “Non disponibili”, senza sostituirla con una spesa pari a zero. La disponibilità dei dati dipende dai tempi di aggiornamento dei fornitori e dall'attivazione dell'esportazione.
