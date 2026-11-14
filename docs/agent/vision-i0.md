# I0 — Contratto di integrazione visione / agent

Stato: decisioni tecniche fissate per I1–I6; il percorso I1 usa la copia versionata descritta nella [guida I1](i1-vision-import.md). Contratto eseguibile: `server/agent/contracts/vision.ts`.

## Distribuzione dei sorgenti

La feature è un submodule Git fissato al commit `9803a5f41eff521db5d1305af82323da11332eb5`, pubblicato sul ramo `integration/agent-vision-v2` della repository palpebrale. Comprende il parser v2 e il collegamento diretto all'agent. Per un nuovo clone usare `git clone --recurse-submodules`; per una copia esistente usare `git submodule update --init --recursive` dopo aver aggiornato la repository principale e salvato eventuali modifiche locali nel submodule.

I1 usa una copia dichiarata e verificabile con hash dei moduli puri e un worker compilato, descritti nella [guida I1](i1-vision-import.md). I 20 sorgenti TypeScript della copia sono stati confrontati con il commit pubblicato e coincidono, normalizzando i fine riga. La copia resta disponibile nel backend; gli aggiornamenti futuri devono mantenere allineati sorgenti, hash e worker. Non sono importati webcam, React o runtime MediaPipe nel backend.

## Acquisizione e limiti

I1 espone `POST /api/agent/v1/sessions/{sessionId}/vision-observations`, `Content-Type: application/json` con il JSON `crewready-session-v2` come corpo, e un `Idempotency-Key` obbligatorio. L'autenticazione e l'astronauta provengono dal server, non dal file. Il `GET` dello stesso percorso è limitato al proprietario. L'export deve appartenere alla sessione richiesta per associazione operata dal server; il contenuto importato non prova l'identità della persona ripresa.

La route legge al massimo 10 MiB UTF-8 anche in streaming, rifiuta richieste maggiori con `PAYLOAD_TOO_LARGE`, consente al massimo 18.000 campioni e 18.001 campioni di prestazione, e accetta soltanto session v2 / C01 v2. Il limite API è più restrittivo dei 50 milioni di caratteri del parser. Prima dell'elaborazione rifiutare JSON malformato e conteggi eccessivi. L'intero parsing e replay sincrono va eseguito in un worker isolato terminabile dopo 5 secondi; una race con timer nello stesso thread non interrompe il lavoro CPU. Rifiutare timeout con `PROVIDER_TIMEOUT`, versione o contenuto invalido con `VALIDATION_ERROR`, sessione inesistente/altrui con `NOT_FOUND`, sessione conclusa con `INVALID_STATE`. Nessun payload grezzo nei log o nei messaggi d'errore.

SHA-256 è calcolato dal server sui byte ricevuti; retry con stessa chiave e stessi byte restituisce lo stesso risultato, stessa chiave e byte diversi dà `IDEMPOTENCY_CONFLICT`. Byte diversi con stesso contenuto JSON non sono considerati identici. Digest e validazione provano integrità/coerenza, non autenticità dell'origine.

## Tempo e qualità

Per webcam, `startedAt` e `endedAt` derivano da `timeOriginUnixMs + snapshot.session.startMs/endMs`, convertiti in UTC; i due valori sono null se l'intervallo non esiste. Rifiutare intervalli impossibili, nel futuro oltre 5 minuti o successivi all'esportazione oltre la stessa tolleranza. La tolleranza serve al disallineamento degli orologi, non garantisce che il tempo sia autentico. Il replay sintetico mantiene `startedAt` e `endedAt` null: non inventare una data reale. `exportedAt` viene convertito a UTC se valido; `importedAt` è assegnato dal server.

Parametri iniziali sperimentali fissati e configurabili sul server: almeno 30.000 ms validi, copertura almeno 0,70, fine misura negli ultimi 120 minuti. `NO_VALID_TIME`, `TOO_SHORT`, `LOW_COVERAGE`, `STALE`, `INTERRUPTED` sono motivi cumulabili; `user_stop` è una conclusione regolare, gli altri motivi di interruzione rendono la misura insufficiente. Le fixture sintetiche restano `INSUFFICIENT` con `SYNTHETIC_TIME_UNAVAILABLE` nel percorso operativo; possono essere mostrate nella demo e usate in test dedicati, chiaramente etichettate. Non inventare soglie di stanchezza. Il calcolo qualità va fissato rispetto all'istante di conferma e registrato nel contesto congelato: l'utilizzabilità può cambiare col passare del tempo.

## Selezione, condivisione e compatibilità

La selezione consiste in `{ visionObservationId: string | null, shareWithGround: boolean }`; `true` richiede un ID. I1 estende il payload di conferma con `vision`, verificando che la misura appartenga ad astronauta e sessione. La revisione attesa protegge contemporaneamente selezione, osservazioni e conferma. Se assente nel payload v1, l'adattatore di compatibilità interpreta `{ visionObservationId: null, shareWithGround: false }`. La selezione è immutabile dopo conferma; i retry identici restituiscono lo stesso risultato, modifiche successive sono conflitti.

La conferma salva atomicamente una copia immutabile delle osservazioni condivise, dei sensori selezionati e del riepilogo vision autorizzato, con qualità e criteri usati. La generazione e i retry leggono esclusivamente lo snapshot. Per i check-in storici già confermati senza snapshot, una migrazione esplicita deve marcare il contesto come `LEGACY_UNAVAILABLE`; non ricostruirlo tacitamente con dati correnti. Definire un percorso di rigenerazione o nuovo check-in prima di modificare il comportamento esistente.

Le nuove route vision usano `/api/agent/v1/sessions/{sessionId}/vision-observations` e l'envelope v1 già esistente. La conferma estesa usa **`POST /api/agent/v2/check-ins/{id}/confirm`**, con corpo validato da `ConfirmCheckInWithVisionRequestSchema` ed envelope `meta.contractVersion: "2.0.0"`. La risposta `data` contiene `{ checkIn, vision }`: `checkIn` mantiene la forma v1, `vision` è la selezione confermata. La route v1 resta disponibile con il proprio payload e interpreta l'assenza di selezione come nessuna misura condivisa; il backend applica la stessa transazione e le stesse regole di idempotenza. In caso di richieste concorrenti tra v1 e v2 prevale il controllo di revisione. Le risposte v1 non ricevono campi nuovi e continuano a essere validate dagli schemi esistenti. I report e le proposte dovranno accettare `VisionEvidenceRefSchema` soltanto dopo I3 e una versione compatibile esplicita.

Per il MVP si conserva il riepilogo con digest e versione, non l'export originale né immagini/video; definire un periodo di conservazione con i proprietari dei dati prima di un uso oltre la demo. I dati non condivisi restano fuori dal contesto operativo. Una condivisione non autorizza la trasmissione a provider esterni: tale trattamento va configurato e reso esplicito nell'integrazione finale.

## Criteri di chiusura I0

Le fixture in `tests/agent/vision-contract.test.ts` documentano struttura, valori mancanti, origine sintetica e scelte di condivisione. Le decisioni su soglie e versione API sono fissate e la revisione v2 è pubblicata e fissata nel submodule. I parametri non sono soglie cliniche e le prove sintetiche non validano le misure su persone.
