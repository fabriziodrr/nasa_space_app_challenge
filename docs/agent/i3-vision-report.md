# I3 — Visione nel report operativo

La generazione usa lo snapshot congelato alla conferma. Se la misura non è stata condivisa, `vision` è `null` e l'AI operativa non riceve alcun dato palpebrale. Il diario rimane separato. La misura condivisa viene proiettata nei soli campi utili all'analisi, senza digest, ID di calibrazione o contenuto grezzo.

Una misura webcam `USABLE` può essere citata come `{ "source": "vision", "visionObservationId": "..." }` in un finding o nell'evidenza di una proposta. Il server accetta solo l'ID presente nello snapshot autorizzato; riferimenti inventati, privati, sintetici o insufficienti sono rifiutati. Una deduzione che combina fonti usa `source: "inference"` e cita ciascuna evidenza. La visione descrive la misura degli occhi: non prova ore di sonno, stanchezza o una diagnosi.

Le osservazioni condivise sintetiche o insufficienti possono essere descritte come incertezze, ma non costituiscono evidenza utilizzabile per conclusioni o proposte. Il server aggiunge al report un'informazione deterministica su origine, stato, intervallo, tempo valido, copertura e limitazioni, anche se l'AI la omette. Il provider simulato genera anche un finding per una webcam utilizzabile; Nemotron riceve le stesse limitazioni nelle istruzioni.

I report con riferimenti di tipo `vision` richiedono `GET /api/agent/v2/reports?astronautId=...`; la risposta usa `meta.contractVersion: "2.0.0"`. La route v1 restituisce `409 INVALID_STATE` se la pagina richiesta contiene riferimenti vision, evitando di inviare una struttura nuova ai vecchi client. I report precedenti senza vision continuano a essere leggibili in v1. Le verifiche di autenticazione e ambito astronauta sono identiche per v1 e v2.

Il validatore delle proposte riconosce la stessa evidenza condivisa e utilizzabile. La generazione di proposte resta disattivata nel runtime dimostrativo (`allowProposals` non è abilitato): il modello NVIDIA restituisce `proposal: null` finché non viene collegato il programma autorevole versionato. Un'eventuale attivazione dovrà prevedere anche contratti/API v2 per esporre proposte con evidenze vision, oltre al normale flusso di approvazione di Terra.

I check-in già confermati prima dell'introduzione degli snapshot restano consultabili, ma una nuova generazione richiede un nuovo check-in se il contesto congelato non è disponibile. Le prove dell'integrazione usano fixture e database temporanei; la validazione su webcam e persone reali resta un task distinto.
