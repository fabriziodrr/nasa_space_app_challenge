# Piano di conoscenza: unificazione del backend AEGIS

Stato: analisi e proposta, non ancora implementata. Base: branch `emanuel_fix_agent` e relative modifiche locali presenti al momento dell'analisi. Prima dell'attuazione verificare le modifiche che Matteo avrà eventualmente introdotto. La vista e l'analisi Sleep Recovery sono un vincolo: non riscriverle né modificarne i risultati di base.

## Obiettivo

Preparare un unico punto backend per acquisire il contesto disponibile, associare correttamente profilo e sessione, produrre uno snapshot coerente e alimentare la stesura del report a partire da osservazioni oculari, dati sintetici già presenti e dichiarazioni dell'astronauta. L'interfaccia non deve richiedere token o file JSON manualmente.

Un backend comune è un confine logico unico per i consumatori; non richiede subito di fondere fisicamente i due database. La prima implementazione proposta mantiene la proprietà dei dati esistenti e unifica lettura, autorizzazione, snapshot e generazione del report. Una eventuale migrazione a un unico archivio è una fase separata, da progettare senza interrompere Sleep Recovery.

## Inventario verificato

| Componente | Stato e responsabilità |
| --- | --- |
| Visione | MediaPipe Face Landmarker float16 v1, file locale `feature-visione-palpebrale/vision-prototype/public/models/face_landmarker.task` e WASM. L'hash SHA-256 dell'asset coincide con quello dichiarato nel codice. Il prototipo calcola metriche oculari con `TemporalEngine`; non è un modello linguistico. |
| Import vision | L'host riceve il riepilogo del prototipo, il worker lo valida e `VisionService` salva osservazione e selezione in Prisma. L'usabilità viene rivalutata; webcam, replay sintetico, dati insufficienti e dati vecchi restano distinguibili. |
| Parlato | Il riconoscimento browser produce testo; esistono adattatori opzionali di trascrizione/sintesi. `inputMode=VOICE` identifica un messaggio vocale trascritto, non una misura acustica di emozione o affaticamento. |
| Conversazione | `AGENT_AI_PROVIDER` seleziona mock, NVIDIA o OpenAI. Nel file locale risulta selezionato NVIDIA con Nemotron e una chiave configurata; questo non prova che la chiamata live funzioni. Il modello riceve contesto strutturato e propone osservazioni verificabili e correggibili. |
| Stesura | `ArtifactService` genera report operativo e diario separato usando NVIDIA o mock. Il provider OpenAI attuale implementa solo la conversazione: con OpenAI il runtime non abilita `ArtifactService`. Non assumere che tutti i provider scrivano report. |
| Agente dati Python | `data_agent.py` è un workflow LangGraph deterministico, non un LLM. Compone sonno, feedback confermato e vision; la conclusione incrociata è attualmente nulla. `companion.py` può usare un modello Ollama separato: richiede configurazione e servizio locale; nell'ambiente esaminato il servizio Ollama non rispondeva. |
| Dati JSON | `server/examples/` contiene fixture sintetiche; non rappresentano un sensore attivo. Cognitive state e vigilance della dashboard includono anche profili fittizi in `server/examples/crew_profiles.ts`. |
| Persistenza | SQLite Python conserva le osservazioni e serve Sleep Recovery. Prisma/SQLite conserva sessioni, messaggi, check-in, selezioni vision, snapshot e report. Non esiste oggi un solo archivio fisico. |

L'esistenza di un modello o di un adattatore non equivale a una verifica della sua accuratezza, disponibilità live o corretta integrazione con il sito di Matteo.

## Flussi e lacune

1. **Occhi:** webcam autorizzata e calibrazione → landmarks MediaPipe → metrica temporale → validazione, selezione e persistenza Prisma → contesto della conversazione. Al check-in, la misura entra nello snapshot destinato a Terra solo se esplicitamente condivisa. Il rapporto demo Python legge la selezione attraverso un ponte HTTP; quel percorso non va considerato equivalente all'autorizzazione del report Terra.
2. **Dati sintetici:** il servizio Python valida e conserva gli esempi importati e produce `agent-context`; `PythonSensorProvider` li traduce per il modulo agent. Le fixture devono conservare soggetto demo, origine, unità, timestamp e indicazione sintetica, senza diventare automaticamente una storia personale verificata.
3. **Voce:** browser o provider → trascrizione → messaggio `VOICE` → conversazione → proposta di check-in → revisione/conferma → report operativo sulle sole osservazioni condivise. Non c'è una sincronizzazione automatica tra check-in Prisma e `SpeechFeedback` Python. La prova end-to-end isolata ha mostrato `reported_state=missing`; il codice conferma l'assenza del collegamento. Una frase vaga non fornisce da sola una scala numerica.
4. **Report:** coesistono un report operativo/diario in Prisma e un rapporto deterministico Python. Il rapporto demo cerca l'ultima selezione del profilo tra sessioni, mentre il report operativo usa la sessione del check-in. Inoltre `snapshot_id` Python identifica i soli dati Python: non cambia necessariamente quando cambia la vision letta separatamente. Non esiste ancora una singola stesura che consumi uno stesso snapshot comune con provenienza e permessi coerenti.

Rischio da correggere prima di usare le scale: `server/agent/core/conversation-service.ts` assegna `scaleMax: 10` alle nuove osservazioni di stanchezza e qualità del sonno senza verificare che la scala dichiarata dal provider sia 10. Validare valore, scala e riferimento al messaggio e mantenere ambiguità come dato non confermato. La validazione attuale del riferimento al messaggio non dimostra da sola che il contenuto del messaggio supporti semanticamente il numero estratto.

## Soluzione proposta per il prossimo intervento

1. **Rilevare lo stato aggiornato.** Riesaminare branch, file locali e integrazione effettiva dell'agente online di Matteo; non sovrascrivere modifiche concorrenti né presumere il provider effettivo. Censire contratti e risultati attuali di Sleep Recovery come baseline.
2. **Contratto comune e identità.** Definire uno snapshot versionato lato server con `astronautId`, soggetto dati associato, `sessionId`, timestamp/finestra, ID delle osservazioni, fonte, unità, qualità, stato sintetico, conferma, disponibilità e autorizzazione. Risolvere la mappatura dei profili sul server; la mappatura demo non è una verifica di identità reale. Distinguere mancante, scaduto, non valido e servizio non disponibile.
3. **Lettura senza cambiare Sleep Recovery.** Integrare i dati Python tramite il servizio/API esistente in sola lettura, preservando l'attuale calcolo e risposta dell'analisi sonno. Integrare la vision validata e le osservazioni confermate dal check-in Prisma attraverso adattatori espliciti. Non scrivere feedback vocali nell'archivio Python come effetto collaterale se ciò altera la vista o i risultati Sleep Recovery.
4. **Voce e conferma.** Riutilizzare testo trascritto e check-in già esistenti: estrazione inizialmente come bozza con riferimenti ai messaggi; trasferire al contesto solo valori espliciti, con scala corretta e stato di conferma. Conservare note testuali con provenienza dove utili, senza inventare punteggi, trasformare una deduzione del modello in dichiarazione o etichettare come sintetico parlato reale. Progettare separatamente eventuali metriche acustiche solo quando esiste il relativo componente e contratto.
5. **Snapshot e report.** Alla conferma costruire e congelare il contesto autorizzato, preservando i dati privati e il consenso separato per Terra; riusare e adattare `ArtifactService` e le validazioni delle evidenze. Un report unico deve indicare fonti, tempi, qualità, dati mancanti, incertezze e carattere sintetico, senza trattare la chiusura oculare come diagnosi o misura diretta del sonno. Il diario rimane privato. Il provider selezionato deve supportare esplicitamente la stesura, altrimenti lo stato deve dichiararlo.
6. **Affidabilità.** Evitare scritture duplicate non atomiche fra i due database. Se in futuro si decide di replicare eventi tra archivi, usare identificativi stabili, idempotenza e una coda/outbox persistente con retry e riconciliazione. Le chiamate di rete e ai modelli restano fuori dalle transazioni DB.
7. **Interfaccia.** Collegare il sito di Matteo allo stesso contratto backend e rimuovere dipendenze residue da sessioni o input manuali nella sola integrazione necessaria. Non toccare la parte Sleep Recovery di base.

## Verifiche richieste prima di dichiarare finito

- Test di regressione della vista Sleep Recovery e dei risultati della stessa fixture, comprese assenza e backend non disponibile.
- Flusso completo con profilo demo unico: fixture sintetica, misura vision valida o esplicitamente sintetica, messaggio vocale trascritto con punteggio esplicito e corretto, conferma e report; verificare contenuti, fonti e identificativi, non soltanto HTTP 200.
- Provare assenza del feedback, valori ambigui e scale diverse, osservazione modificata, retry e duplicati, misure vecchie o insufficienti, servizio Python offline, isolamento fra astronauti e mancato consenso alla condivisione.
- Verificare che rapporto astronauta, rapporto Terra e diario rispettino le rispettive autorizzazioni. Un report dati demo che seleziona il profilo astronauta non deve aggirare la scelta di condivisione verso Terra.
- Test dei provider: mock per riproducibilità, NVIDIA realmente configurato e disponibile quando autorizzato; eventuale OpenAI solo se il provider supporterà anche i metodi operativi. Ollama non è richiesto per il workflow deterministico, ma serve se si usa il companion Python.
- Collaudo nel browser con webcam e microfono effettivi, permessi, stop/interruzione, qualità della misura, gestione errori e reload; misurare la qualità e non confondere la simulazione con una prova fisica.

## Evidenze e punti di ingresso

- `server/agent/runtime.ts`, `server/agent/ports.ts`, `server/agent/core/conversation-service.ts`.
- `server/agent/vision/service.ts`, `server/agent/vision/confirmation.ts`, `server/agent/services/artifacts.ts`.
- `server/src/aegis_data/models.py`, `service.py`, `data_agent.py`, `integrated_context.py`, `vision_bridge.py`.
- `prisma/schema.prisma`, `docs/agent/contratto-backend-dati.md`, `docs/SPEECH_DATA_CONTRACT.md`.
- `tests/agent/` e `server/tests/`; le verifiche precedenti includevano 134 test agent, 47 Python e una prova HTTP isolata con dati sintetici. Nessuna prova fisica webcam/microfono è stata eseguita in questa sessione.
