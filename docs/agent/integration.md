# Agent module integration — API and linking contract

Status: **contract-based integration documentation**. Executable schemas are in `server/agent/contracts/`; server interfaces in `server/agent/ports.ts`. This guide describes the HTTP contract the dashboard must use, not internal agent details.

> Route implementation status: sessions and messages exposed (T1), check-in, report and diary (T2), voice (T3) and vision. Proposals and decisions are available in **v2** with `GET /api/agent/v2/proposals` and `POST /api/agent/v2/proposals/:id/decision`; the schedule is readable from `GET /api/agent/v2/schedule`. The demo runtime uses a persistent/versioned schedule. See [Report and schedule](./report-and-schedule.md) for constraints, examples and v2 schemas.

## General principles

- Prefix: `/api/agent/v1` for the historical catalog below; proposals, decisions, schedule reading and vision reports use `/api/agent/v2` and `meta.contractVersion: "2.0.0"`.
- Positive JSON response:

```json
{ "data": {}, "meta": { "contractVersion": "1.0.0", "requestId": "request-1" } }
```

- JSON error (`ApiError`):

```json
{ "error": { "code": "VERSION_CONFLICT", "message": "...", "requestId": "request-1", "retryable": false, "issues": [], "currentVersion": 2 } }
```

- The role is **not** read from the body: it derives from the server-verified identity (`IdentityProvider`). Missing authentication → 401; disallowed role → 403; nonexistent or other user's resource → 404.
- Time: ISO 8601 UTC timestamps with `Z`; dates `YYYY-MM-DD`; positive integer versions. The schedule declares an explicit IANA timezone.
- All objects are `strict`: unknown fields rejected, no implicit coercion (routes explicitly convert `limit` from query).

### Error codes

| Code | HTTP | Meaning |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | invalid payload/parameters |
| `UNAUTHENTICATED` | 401 | missing authentication |
| `FORBIDDEN` | 403 | disallowed role |
| `NOT_FOUND` | 404 | missing or inaccessible resource |
| `VERSION_CONFLICT` | 409 | revision/version not up to date; `currentVersion` populated |
| `INVALID_STATE` | 409 | state not allowed for the operation |
| `IDEMPOTENCY_CONFLICT` | 409 | idempotency key reused with different payload/operator |
| `PAYLOAD_TOO_LARGE` | 413 | body over limit |
| `UNSUPPORTED_AUDIO` | 415 | audio format not allowed |
| `RATE_LIMITED` | 429 | AI provider limit reached |
| `INVALID_AI_OUTPUT` | 502 | invalid model output |
| `PROVIDER_UNAVAILABLE` | 503 | AI provider unavailable |
| `PROVIDER_TIMEOUT` | 504 | AI provider timeout |
| `INTERNAL_ERROR` | 500 | internal error |

### Pagination

Lists use `{ items, nextCursor }`, stable ordering by creation date descending and ID as tiebreaker, default limit 20 and maximum 100. The cursor is the ID of the last returned item; pass it as `cursor` for the next page. Session messages are paginated in groups of up to 200 in chronological order, with `nextMessageCursor` for the previous page.

## Endpoints

| Method and path | Role | Body / query | Response |
| --- | --- | --- | --- |
| `POST /sessions` | astronaut | `{ astronautId }` | 201, session |
| `POST /sessions/:id/messages` | astronaut | `{ clientMessageId, text, inputMode }` | 200, `MessageResult` |
| `GET /sessions/:id` | astronaut | `beforeMessageId?` | 200, `SessionState` |
| `PATCH /check-ins/:id` | astronaut | `{ expectedRevision, observations }` | 200, updated check-in |
| `POST /check-ins/:id/confirm` | astronaut | `{ expectedRevision, sharedObservationIds }` | 202, `SessionState` |
| `GET /api/agent/v2/proposals` | astronaut/Terra | `astronautId`, `cursor?`, `limit?` | 200, v2 proposals page |
| `POST /api/agent/v2/proposals/:id/decision` | Terra | `{ decision, comment }` + header `Idempotency-Key` | 200, `DecisionResult` v2 |
| `GET /api/agent/v2/schedule` | astronaut/Terra | `astronautId`, `date` | 200, `ScheduleSnapshot` v2 |
| `GET /reports` | astronaut/Terra | `astronautId`, `cursor?`, `limit?` | 200, reports page |
| `GET /diary` | astronaut | `astronautId`, `cursor?`, `limit?` | 200, diary page |
| `PATCH /diary/:id` | astronaut | `{ expectedRevision, text, status }` | 200, diary entry |
| `POST /voice/transcriptions` | astronaut | multipart: `audio`, `sessionId`, `durationSeconds` | 200, `{ text, language }` |
| `POST /voice/speech` | astronaut | `{ sessionId, messageId }` | 200, binary `audio/mpeg` |

Executable catalog of methods, roles and schemas: `server/agent/contracts/endpoints.ts`.

### Main objects

- `MessageResult`: `{ astronautMessage, assistantMessage, checkIn }`.
- `SessionState`: `{ session, messages, nextMessageCursor, checkIn, generationStatus, reportId, diaryEntryId, proposal, noChangeReason }`. `generationStatus` is `NOT_STARTED`, `PROCESSING`, `READY` or `FAILED`.
- `DecisionResult`: `{ decision, proposal, schedule }`. `schedule` is populated only when `proposal.status === "APPLIED"`.
- `ScheduleProposal` (states): `PENDING_REVIEW`, `APPROVED`, `REJECTED`, `APPLIED`, `STALE`, `APPLY_FAILED`.

## Call examples

### Open a session

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

### Send a message

```http
POST /api/agent/v1/sessions/session-1/messages
Authorization: Bearer <token>
Content-Type: application/json

{ "clientMessageId": "client-msg-1",
  "text": "Ho dormito quattro ore e mezza. Qualita 2 su 10, stanchezza 4 su 10.",
  "inputMode": "TEXT" }
```

Response: astronaut message, assistant response and check-in draft (`MessageResult`). `clientMessageId` is idempotent: repeating the same request returns the same result; the same ID with different text returns 409 `IDEMPOTENCY_CONFLICT`.

### Correct and confirm check-in

```http
PATCH /api/agent/v1/check-ins/checkin-1
{ "expectedRevision": 1, "observations": [ ... ] }
```

```http
POST /api/agent/v1/check-ins/checkin-1/confirm
{ "expectedRevision": 2, "sharedObservationIds": ["obs-hours", "obs-quality", "obs-fatigue"] }
```

Confirmation returns 202 without waiting for the model: poll `GET /sessions/:id` (every 2 seconds) until `generationStatus` becomes `READY` or `FAILED`. In `READY`, report and diary always exist and there is either a proposal or `noChangeReason`.

### List and decide a proposal

```http
GET /api/agent/v2/proposals?astronautId=astro-1
Authorization: Bearer <token-terra>
```

```http
POST /api/agent/v2/proposals/proposal-1/decision
Authorization: Bearer <token-terra>
Idempotency-Key: approve-proposal-1
Content-Type: application/json

{ "decision": "APPROVE", "comment": "Variazione compatibile con le attivita di oggi." }
```

Only `GROUND_CONTROL` can decide. The `Idempotency-Key` header is associated with proposal, operator and normalized payload: an identical replay returns the original decision; key reused with different payload/operator → 409 `IDEMPOTENCY_CONFLICT`; incompatible decision → 409 `INVALID_STATE`.

### Retrieve state after a timeout or reload

```http
GET /api/agent/v1/sessions/session-1
```

`DecisionResult.schedule` is present only after application; in other states `schedule` is `null` and the proposal status communicates the actual outcome. Only `APPLIED` authorizes the message "The schedule has been updated".

Complete example files: `docs/agent/examples/normal.json`, `normal-response.json`, `no-change.json`, `stale.json`.

## Voice

The voice path uses the same services and messages as the text path. Two modes:

- **Browser (default)**: recognition and synthesis delegated to the browser (`AGENT_VOICE_PROVIDER=browser`). No keys required; requires a secure context (`localhost` or HTTPS). Transcription is editable and must be sent with the normal messages API using `inputMode: "VOICE"`.
- **Server (optional)**: with `AGENT_VOICE_PROVIDER=nvidia_nim` the two authenticated routes are activated, using local NVIDIA Speech NIM services (ASR and TTS with `it-IT`) configured via `AGENT_NIM_ASR_URL`/`AGENT_NIM_TTS_URL` (only loopback origins accepted).

`POST /voice/transcriptions` — `multipart/form-data` with `sessionId`, `durationSeconds` and `audio` (file `audio/wav`, PCM 16 bit, mono or stereo). Limits: 10 MiB and 120 s; duration is verified from content. Responds `{ text, language }` and **does not** automatically send the message: the interface shows the text for correction and then uses `POST /sessions/:id/messages` with `inputMode: "VOICE"`.

`POST /voice/speech` — JSON `{ sessionId, messageId }`; returns `audio/mpeg` (`Cache-Control: no-store`) for an `ASSISTANT` response of the authenticated astronaut's session (text up to 2000 characters). It is not a public synthesis endpoint: it does not accept arbitrary text.

Audio is processed in memory without temporary files or logging. Disallowed format → `UNSUPPORTED_AUDIO`; services not configured or unreachable → `PROVIDER_UNAVAILABLE`.

## Configuration and environment variables

Credentials are read only on the server and never sent to the browser. No secret should be inserted into logs or code.

| Variable | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | — | Local SQLite for Prisma |
| `NODE_ENV` | `development` | `production` prohibits simulated demo |
| `AGENT_DEMO_ENABLED` | `false` | `true` enables local demo, prohibited in production |
| `AGENT_DEMO_TOKEN` | — | demo token, 16–512 characters (simulated authentication) |
| `AGENT_GROUND_TOKEN` | — | distinct demo token for `GROUND_CONTROL` (report/proposal access) |
| `AGENT_DEMO_SCENARIO` | `RESTED` | `RESTED`, `POOR_SLEEP`, `CONFLICTING_DATA` |
| `AGENT_AI_PROVIDER` | `mock` | `mock`, `nvidia`, `openai` |
| `NVIDIA_API_KEY`, `NVIDIA_MODEL` | — | mandatory only for `nvidia` |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | — | mandatory only for `openai` |
| `AGENT_VOICE_PROVIDER` | `browser` | `browser`, `nvidia_nim`, `elevenlabs` |
| `AGENT_NIM_ASR_URL`, `AGENT_NIM_TTS_URL` | — | mandatory only for `nvidia_nim`; loopback origin |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | — | mandatory only for `elevenlabs` |
| `ELEVENLABS_MODEL_ID` | `eleven_multilingual_v2` | ElevenLabs TTS model |
| `AGENT_AI_TIMEOUT_MS` | `30000` | 100–120000 ms |
| `AGENT_CONTEXT_MESSAGE_LIMIT` | `20` | 1–100 messages |
| `AGENT_PREVIOUS_CHECK_IN_LIMIT` | `3` | 0–10 previous check-ins |

Validation in `server/agent/config.ts`. Configuration error messages do not expose variable values.

## Replacing providers

Adapters implement the interfaces in `server/agent/ports.ts`; the composition point is `server/agent/runtime.ts`. No modification to the agent core is required.

- `IdentityProvider.authenticate({ authorizationHeader, sessionCookie })` → `Identity | null`. Verifies credentials on the server and does not build the role from the body. Demo example: `adapters/demo-identity.ts`; for Fabrizio's real login replace this adapter.
- `SensorProvider.read(astronautId, window)` → `SensorReading[]`. Example: `adapters/sensors.ts` (N1) or `adapters/demo-context.ts` (bootstrap T1).
- `ScheduleReader.getDay(astronautId, date)` and `ScheduleProvider` (with `getById`, `applyApproved`, `getApplication`). The external schedule is still to be agreed with Emanuel's backend; the runtime uses `adapters/demo-program.ts`, based on persistence from `adapters/schedule.ts`.
- `AiProvider` (`ConversationAiProvider`, `OperationalAiProvider`, `DiaryAiProvider`). Explicit selection in `adapters/conversation-ai-factory.ts`; no automatic fallback between providers.
- `VoiceProvider` (`transcribe`, `synthesize`). Server example: `adapters/nvidia-nim-voice.ts`; the demo uses browser recognition and synthesis. The contract allows replacing the adapter without changing the dashboard.

Public types in `server/agent/contracts/index.ts` are importable from the frontend without dragging in Prisma, Next.js or environment variables.

## Transactional responsibility, idempotency and reconciliation

- The agent can read the schedule and create proposals; it has no tool to apply or approve them. Only Terra's authorized decision, through the service, invokes `ScheduleProvider.applyApproved`.
- The repository (`AgentRepository`, `adapters/prisma/repository.ts`) uses transactions with compare-and-swap on revision/version: `commitTurn` deduplicates by `clientMessageId` and saves messages and draft in a single transaction; `confirmCheckIn` is idempotent; `completeGeneration` publishes artifacts once per check-in with lease.
- Do not perform AI or network calls inside a database transaction.
- `applyApproved` performs atomic version check, mutation and durable deduplication for `proposalId`/`decisionId` in the same transaction. A different command with the same pair is a conflict.
- Application outcomes: `APPLIED`, `STALE`, `FAILED`, `UNKNOWN`. A timeout after a possible send produces `UNKNOWN`: the proposal remains `APPROVED` and the outcome is reconciled via `getApplication(proposalId, decisionId)`. Do not mark `APPLY_FAILED` when the outcome is only unknown.

Proposal states:

```text
PENDING_REVIEW -> REJECTED
PENDING_REVIEW -> APPROVED -> APPLIED
PENDING_REVIEW -> STALE
APPROVED      -> STALE
APPROVED      -> APPLY_FAILED
APPLY_FAILED  -> APPLIED | STALE
```

An obsolete proposal (schedule version changed) is marked `STALE` and does not produce a new approval; it must be regenerated and re-approved.

## Linking with Fabrizio's dashboard

To be agreed with Fabrizio: real login system (replacing `IdentityProvider`), owner of the authoritative schedule backend and transactional mechanism (replacing `ScheduleProvider`). The dashboard must use the same endpoints as the demo: no demo UI component is mandatory and the agent core must not be modified.

## References

- [v1 contracts (C0)](./contracts-v1.md)
- [Setup, reset and startup (N1)](./setup.md)
- [Voice (T3)](./t3-voice.md)
- Schemas and types: `server/agent/contracts/index.ts`
- Provider interfaces: `server/agent/ports.ts`
- Examples: `docs/agent/examples/`
