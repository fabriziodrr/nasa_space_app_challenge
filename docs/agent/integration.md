# Integrazione del modulo agent — API e contratto di collegamento

Stato: **documentazione di integrazione basata sui contratti C0**. Gli schemi eseguibili sono in `server/agent/contracts/`; le interfacce server in `server/agent/ports.ts`. Questa guida descrive il contratto HTTP che la dashboard deve usare, non i dettagli interni dell'agent.

> Stato di implementazione delle route: `POST /sessions`, `GET /sessions/:id` e `POST /sessions/:id/messages` sono implementate (T1). Le restanti route (check-in, proposte, decisione, report, diario, voce) sono contratte in C0 e verranno esposte nell'integrazione; il payload e gia vincolato dagli schemi condivisi. Non serve attendere le route per sviluppare una vista: le firme non cambiano.

## Principi generali

- Prefisso: `/api/agent/v1`.
- Risposta positiva JSON:

```json
{ "data": {}, "meta": { "contractVersion": "1.0.0", "requestId": "request-1" } }
```

- Errore JSON (`ApiError`):

```json
{ "error": { "code": "VERSION_CONFLICT", "message": "...", "requestId": "request-1", "retryable": false, "issues": [], "currentVersion": 2 } }
```

- Il ruolo **non** viene letto dal corpo: deriva dall'identita verificata dal server (`IdentityProvider`). Autenticazione assente → 401; ruolo non ammesso → 403; risorsa inesistente o altrui → 404.
- Tempo: timestamp ISO 8601 UTC con `Z`; date `YYYY-MM-DD`; versioni intere positive. Il programma dichiara un fuso IANA esplicito.
- Tutti gli oggetti sono `strict`: campi sconosciuti rifiutati, nessuna coercizione implicita (le route convertono esplicitamente `limit` da query).

### Codici errore

| Codice | HTTP | Significato |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | payload/parametri non validi |
| `UNAUTHENTICATED` | 401 | autenticazione assente |
| `FORBIDDEN` | 403 | ruolo non ammesso |
| `NOT_FOUND` | 404 | risorsa assente o non accessibile |
| `VERSION_CONFLICT` | 409 | revisione/versione non aggiornata; `currentVersion` valorizzato |
| `INVALID_STATE` | 409 | stato non ammesso per l'operazione |
| `IDEMPOTENCY_CONFLICT` | 409 | idempotency key riusata con payload/operatore diverso |
| `PAYLOAD_TOO_LARGE` | 413 | corpo oltre il limite |
| `UNSUPPORTED_AUDIO` | 415 | formato audio non ammesso |
| `RATE_LIMITED` | 429 | limite del provider AI raggiunto |
| `INVALID_AI_OUTPUT` | 502 | output del modello non valido |
| `PROVIDER_UNAVAILABLE` | 503 | provider AI non disponibile |
| `PROVIDER_TIMEOUT` | 504 | provider AI in timeout |
| `INTERNAL_ERROR` | 500 | errore interno |

### Paginazione

Le liste usano `{ items, nextCursor }`, ordinamento stabile per data di creazione discendente e ID come spareggio, limite predefinito 20 e massimo 100. Il cursore e l'ID dell'ultimo elemento restituito; passarlo come `cursor` per la pagina successiva. I messaggi di sessione sono paginati a gruppi di massimo 200 in ordine cronologico, con `nextMessageCursor` per la pagina precedente.

## Endpoint

| Metodo e percorso | Ruolo | Body / query | Risposta |
| --- | --- | --- | --- |
| `POST /sessions` | astronauta | `{ astronautId }` | 201, sessione |
| `POST /sessions/:id/messages` | astronauta | `{ clientMessageId, text, inputMode }` | 200, `MessageResult` |
| `GET /sessions/:id` | astronauta | `beforeMessageId?` | 200, `SessionState` |
| `PATCH /check-ins/:id` | astronauta | `{ expectedRevision, observations }` | 200, check-in aggiornato |
| `POST /check-ins/:id/confirm` | astronauta | `{ expectedRevision, sharedObservationIds }` | 202, `SessionState` |
| `GET /proposals` | astronauta/Terra | `astronautId`, `cursor?`, `limit?` | 200, pagina di proposte |
| `POST /proposals/:id/decision` | Terra | `{ decision, comment }` + header `Idempotency-Key` | 200, `DecisionResult` |
| `GET /reports` | astronauta/Terra | `astronautId`, `cursor?`, `limit?` | 200, pagina di report |
| `GET /diary` | astronauta | `astronautId`, `cursor?`, `limit?` | 200, pagina di diario |
| `PATCH /diary/:id` | astronauta | `{ expectedRevision, text, status }` | 200, voce di diario |
| `POST /voice/transcriptions` | astronauta | multipart: `audio`, `sessionId`, `durationSeconds` | 200, `{ text, language }` |
| `POST /voice/speech` | astronauta | `{ sessionId, messageId }` | 200, binario `audio/mpeg` |

Catalogo eseguibile di metodi, ruoli e schemi: `server/agent/contracts/endpoints.ts`.

### Oggetti principali

- `MessageResult`: `{ astronautMessage, assistantMessage, checkIn }`.
- `SessionState`: `{ session, messages, nextMessageCursor, checkIn, generationStatus, reportId, diaryEntryId, proposal, noChangeReason }`. `generationStatus` e `NOT_STARTED`, `PROCESSING`, `READY` o `FAILED`.
- `DecisionResult`: `{ decision, proposal, schedule }`. `schedule` e valorizzato solo quando `proposal.status === "APPLIED"`.
- `ScheduleProposal` (stati): `PENDING_REVIEW`, `APPROVED`, `REJECTED`, `APPLIED`, `STALE`, `APPLY_FAILED`.

## Esempi di chiamate

### Aprire una sessione

```http
POST /api/agent/v1/sessions
Authorization: Bearer <token>
Content-Type: application/json

{ "astronautId": "astro-1" }
```

```json
{ "data": { "id": "session-1", "astronautId": "astro-1", "openedAt": "2026-11-14T06:00:00Z", "closedAt": null },
  "meta": { "contractVersion": "1.0.0", "requestId": "request-1" } }
```

### Inviare un messaggio

```http
POST /api/agent/v1/sessions/session-1/messages
Authorization: Bearer <token>
Content-Type: application/json

{ "clientMessageId": "client-msg-1",
  "text": "Ho dormito quattro ore e mezza. Qualita 2 su 5, stanchezza 4 su 5.",
  "inputMode": "TEXT" }
```

Risposta: messaggio dell'astronauta, risposta dell'assistant e bozza del check-in (`MessageResult`). `clientMessageId` e idempotente: ripetere la stessa richiesta restituisce lo stesso risultato; lo stesso ID con testo diverso restituisce 409 `IDEMPOTENCY_CONFLICT`.

### Correggere e confermare il check-in

```http
PATCH /api/agent/v1/check-ins/checkin-1
{ "expectedRevision": 1, "observations": [ ... ] }
```

```http
POST /api/agent/v1/check-ins/checkin-1/confirm
{ "expectedRevision": 2, "sharedObservationIds": ["obs-hours", "obs-quality", "obs-fatigue"] }
```

La conferma restituisce 202 senza attendere il modello: fare polling su `GET /sessions/:id` (ogni 2 secondi) finche `generationStatus` diventa `READY` o `FAILED`. In `READY`, report e diario esistono sempre e c'e una proposta oppure `noChangeReason`.

### Elencare e decidere una proposta

```http
GET /api/agent/v1/proposals?astronautId=astro-1
Authorization: Bearer <token-terra>
```

```http
POST /api/agent/v1/proposals/proposal-1/decision
Authorization: Bearer <token-terra>
Idempotency-Key: approve-proposal-1
Content-Type: application/json

{ "decision": "APPROVE", "comment": "Variazione compatibile con le attivita di oggi." }
```

Solo `GROUND_CONTROL` puo decidere. La chiave `Idempotency-Key` e associata a proposta, operatore e payload normalizzato: un replay identico restituisce la decisione originale; chiave riusata con payload/operatore diverso → 409 `IDEMPOTENCY_CONFLICT`; decisione incompatibile → 409 `INVALID_STATE`.

### Recuperare lo stato dopo un timeout o un reload

```http
GET /api/agent/v1/sessions/session-1
```

`DecisionResult.schedule` e presente solo dopo l'applicazione; negli altri stati `schedule` e `null` e lo stato della proposta comunica l'esito reale. Soltanto `APPLIED` autorizza il messaggio «Il programma e stato aggiornato».

File di esempio completi: `docs/agent/examples/normal.json`, `normal-response.json`, `no-change.json`, `stale.json`.

## Configurazione e variabili d'ambiente

Le credenziali sono lette solo sul server e non vengono inviate al browser. Nessun segreto va inserito nei log o nel codice.

| Variabile | Default | Note |
| --- | --- | --- |
| `DATABASE_URL` | — | SQLite locale per Prisma |
| `NODE_ENV` | `development` | `production` vieta la demo simulata |
| `AGENT_DEMO_ENABLED` | `false` | `true` abilita la demo locale, vietata in produzione |
| `AGENT_DEMO_TOKEN` | — | token demo, 16–512 caratteri (autenticazione simulata) |
| `AGENT_DEMO_SCENARIO` | `RESTED` | `RESTED`, `POOR_SLEEP`, `CONFLICTING_DATA` |
| `AGENT_AI_PROVIDER` | `mock` | `mock`, `nvidia`, `openai` |
| `NVIDIA_API_KEY`, `NVIDIA_MODEL` | — | obbligatori solo per `nvidia` |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | — | obbligatori solo per `openai` |
| `AGENT_AI_TIMEOUT_MS` | `30000` | 100–120000 ms |
| `AGENT_CONTEXT_MESSAGE_LIMIT` | `20` | 1–100 messaggi |
| `AGENT_PREVIOUS_CHECK_IN_LIMIT` | `3` | 0–10 check-in precedenti |

Validazione in `server/agent/config.ts`. I messaggi di errore di configurazione non espongono i valori delle variabili.

## Sostituire i provider

Gli adattatori implementano le interfacce in `server/agent/ports.ts`; il punto di composizione e `server/agent/runtime.ts`. Non e richiesto modificare il nucleo dell'agent.

- `IdentityProvider.authenticate({ authorizationHeader, sessionCookie })` → `Identity | null`. Verifica le credenziali sul server e non costruisce il ruolo dal body. Esempio demo: `adapters/demo-identity.ts`; per il login reale di Fabrizio sostituire questo adattatore.
- `SensorProvider.read(astronautId, window)` → `SensorReading[]`. Esempio: `adapters/sensors.ts` (N1) o `adapters/demo-context.ts` (bootstrap T1).
- `ScheduleReader.getDay(astronautId, date)` e `ScheduleProvider` (con `getById`, `applyApproved`, `getApplication`). Il programma autorevole resta un sistema esterno da concordare con Fabrizio; l'implementazione simulata e `adapters/schedule.ts`.
- `AiProvider` (`ConversationAiProvider`, `OperationalAiProvider`, `DiaryAiProvider`). Selezione esplicita in `adapters/conversation-ai-factory.ts`; nessun fallback automatico tra provider.

I tipi pubblici in `server/agent/contracts/index.ts` sono importabili dal frontend senza trascinare Prisma, Next.js o variabili d'ambiente.

## Responsabilita transazionali, idempotenza e riconciliazione

- L'agent puo leggere il programma e creare proposte; non dispone di uno strumento per applicarle o approvarle. Solo la decisione autorizzata di Terra, attraverso il servizio, invoca `ScheduleProvider.applyApproved`.
- Il repository (`AgentRepository`, `adapters/prisma/repository.ts`) usa transazioni con confronto-e-scambio su revisione/versione: `commitTurn` deduplica per `clientMessageId` e salva messaggi e bozza in un'unica transazione; `confirmCheckIn` e idempotente; `completeGeneration` pubblica gli artefatti una sola volta per check-in con lease.
- Non eseguire chiamate AI o di rete dentro una transazione di database.
- `applyApproved` effettua controllo atomico della versione, mutazione e deduplicazione durevole per `proposalId`/`decisionId` nella stessa transazione. Un comando diverso con la stessa coppia e un conflitto.
- Esiti dell'applicazione: `APPLIED`, `STALE`, `FAILED`, `UNKNOWN`. Un timeout dopo un possibile invio produce `UNKNOWN`: la proposta resta `APPROVED` e l'esito viene riconciliato tramite `getApplication(proposalId, decisionId)`. Non marcare `APPLY_FAILED` quando l'esito e solo sconosciuto.

Stati della proposta:

```text
PENDING_REVIEW -> REJECTED
PENDING_REVIEW -> APPROVED -> APPLIED
PENDING_REVIEW -> STALE
APPROVED      -> STALE
APPROVED      -> APPLY_FAILED
APPLY_FAILED  -> APPLIED | STALE
```

Una proposta obsoleta (versione del programma cambiata) viene marcata `STALE` e non produce una nuova approvazione; va rigenerata e riapprovata.

## Collegamento con la dashboard di Fabrizio

Da concordare con Fabrizio: sistema di login reale (sostituendo `IdentityProvider`), proprietario del backend autorevole del programma e meccanismo transazionale (sostituendo `ScheduleProvider`). La dashboard deve usare gli stessi endpoint della demo: nessun componente grafico della demo e obbligatorio e il nucleo dell'agent non va modificato.

## Riferimenti

- [Contratti v1 (C0)](./contracts-v1.md)
- [Setup, reset e avvio (N1)](./setup.md)
- Schemi e tipi: `server/agent/contracts/index.ts`
- Interfacce dei provider: `server/agent/ports.ts`
- Esempi: `docs/agent/examples/`
