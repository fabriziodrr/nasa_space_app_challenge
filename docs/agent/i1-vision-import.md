# I1 — Importazione e persistenza palpebrale

L'importazione usa un'istantanea locale dei moduli puri del prototipo in `server/agent/vision/vendor`; `SHA256SUMS.txt` ne registra i contenuti. I 20 sorgenti TypeScript coincidono con la revisione C01 v2 `9803a5f41eff521db5d1305af82323da11332eb5`, pubblicata nella repository palpebrale e fissata nel submodule; il confronto normalizza i fine riga Windows/Unix. È una copia esplicita e versionata nella repository agent. Non modificare separatamente i due motori senza aggiornare test, hash e worker.

`validator-worker.cjs` è generato dai sorgenti vendor tramite `npm run build:vision-worker` con esbuild 0.28.2. Il worker viene lanciato da `server/agent/vision/validate-export.ts`, isolando parsing e replay con limite di 5 secondi. Il processo Next deve partire dalla root del progetto e la distribuzione deve includere il file worker. La validazione verifica coerenza, non autentica che un file provenga effettivamente da una webcam.

Per un checkout nuovo: `npm ci`, `npm run db:generate`, `npm run db:push`, poi `npm run dev`. L'aggiornamento schema I1 aggiunge tre tabelle e indici; non cancella il contenuto delle tabelle esistenti. Verificare il proprio database e procedure di migrazione prima dell'uso in un ambiente condiviso.

Tutte le route richiedono un'identità astronauta valida e controllano la proprietà della sessione:

1. `POST /api/agent/v1/sessions/{id}/vision-observations` con `Authorization: Bearer ...`, `Idempotency-Key: ...`, `Content-Type: application/json` e il file export v2 come corpo. Limite 10 MiB; il risultato è un riepilogo `data` conforme a `VisionObservationSchema`. Una chiave riutilizzata con altri byte produce `409`.
2. `GET /api/agent/v1/sessions/{id}/vision-observations` restituisce fino a 100 riepiloghi, ordinati dal più recente; non restituisce il file grezzo.
3. `PUT /api/agent/v1/sessions/{id}/vision-selection` con `{ "visionObservationId": "..." }` seleziona esplicitamente una misura della sessione; `null` cancella la selezione. La selezione alimenta il contesto della conversazione.
4. `POST /api/agent/v2/check-ins/{id}/confirm` con `{ "expectedRevision": 1, "sharedObservationIds": [], "vision": { "visionObservationId": "...", "shareWithGround": true } }`. L'ID deve corrispondere alla selezione corrente; usare `null` e `false` per confermare senza misura. La risposta `202` contiene `data.checkIn`, `data.vision` e `meta.contractVersion` 2.0.0.

La conferma v1 resta disponibile e rappresenta una conferma senza misura condivisa. La conferma salva atomicamente la revisione, la selezione, i sensori e l'eventuale riepilogo condiviso. I retry identici riutilizzano lo snapshot; modifiche alla selezione o alla revisione sono respinte. I check-in storici confermati prima di I1 e privi di snapshot sono trattati come `LEGACY_UNAVAILABLE`: non si ricostruisce il contesto dai sensori attuali e per una nuova generazione è necessario un nuovo check-in. Gli artefatti già generati rimangono consultabili.

Il report operativo usa i sensori e la misura autorizzata congelati, secondo la [guida I3](i3-vision-report.md). La generazione di proposte nel runtime resta subordinata al programma autorevole. La pagina di importazione e l'invio diretto dalla webcam sono rispettivamente I4 e I5.
