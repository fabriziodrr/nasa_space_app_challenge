# Agent Contracts v1 — C0 work base

Status: **local contract implemented and verifiable; external integration to be confirmed with Fabrizio**.
Contract version: `1.0.0`. Expected HTTP prefix: `/api/agent/v1`.

This document defines implementation agreements. Executable schemas are in `server/agent/contracts/`; server interfaces are in `server/agent/ports.ts`. T1 now implements session opening/reading and message sending: see the [T1 guide](t1-conversation.md). The other catalog routes remain to be implemented in their respective tasks.

## Contract usage

```ts
import { SendMessageRequestSchema } from "@/server/agent/contracts";
import type { SendMessageRequest, ScheduleProposal } from "@/server/agent/contracts";
import type { AiProvider } from "@/server/agent/ports";

const result = SendMessageRequestSchema.safeParse(untrustedJson);
if (!result.success) {
  // La futura route converte gli errori in ApiError, senza esporre il payload.
}
```

The barrel `contracts/index.ts` is usable by the frontend: it does not import Prisma, Next.js, AI SDK, filesystem, or environment variables. `ports.ts` is used by server implementations. Types derive from Zod schemas, without hand-written duplicate DTOs.

Objects are strict: unknown fields are rejected. No automatic string-to-number conversions. The HTTP adapter explicitly converts the query parameter `limit` before validation.

## Decisions fixed for the MVP

| Aspect | Agreement |
| --- | --- |
| Identifiers | Opaque strings of 1–128 alphanumeric characters, hyphen, and underscore; first character alphanumeric |
| Time | ISO 8601 UTC timestamps with `Z`; date `YYYY-MM-DD`; explicit IANA timezone in the program |
| Versions | Positive integers; `revision` for check-in/diary, `version` for program |
| Voice language | Italian (`it`); text always available |
| Sleep quality | Declared scale 1 = very poor, 5 = very good |
| Fatigue | Declared scale 1 = absent/minimal, 5 = very high |
| Missing data | Observation absent from the array, never invented value or scale |
| Simulated metrics | Sleep hours (`h`), number of awakenings (`count`), resting heart rate (`bpm`) |
| Sensor quality | `GOOD`, `DEGRADED`, `UNAVAILABLE`; only `UNAVAILABLE` requires `value: null` |
| Scenarios | `RESTED`, `POOR_SLEEP`, `CONFLICTING_DATA`; internal choice for the demo, not a field of production APIs |
| Program | Single astronaut per snapshot; all MVP activities are exclusive, without overlaps |
| Operations | `MOVE_ACTIVITY` and `ADD_REST`; no deletion, shortening, or priority modification |
| Tests | Integrated runner `node:test`, executed with `tsx`; command `npm run test:agent` |
| New dependencies | Zod for runtime validation; `tsx` was already planned by the project |

Numeric schema limits are prototype format limits, not medical thresholds. Numerical scales are not deduced from the term "bad": the agent asks for the scale or leaves the data absent.

Fixed inputs for future N1 simulators (same program as `examples/normal.json`):

| Scenario | Sensors: hours / awakenings / bpm | Declaration: hours / quality / fatigue | Functional expectation |
| --- | --- | --- | --- |
| `RESTED` | 8 / 1 / 60 | 8 / 4 / 1 | No forced proposal; explicit motivation if the program remains unchanged |
| `POOR_SLEEP` | 4.8 / 6 / 72 | 4.5 / 2 / 4 | Demonstrative candidate break + inventory move, still to be validated and approved |
| `CONFLICTING_DATA` | 8 / 1 / 60 | 4 / 2 / 4 | Keep both sleep values, ask for clarification, report the discrepancy without assuming which is correct |

These inputs are reproducible; real AI provider responses may vary. The simulated AI adapter can return fixed results to verify the full path. The heart rate of the three scenarios is not an intervention threshold.

## Personal information and operational report

A check-in observation has ID, field, value, origin `self_report`, timestamp, and references to the astronaut's messages. Allowed fields are `SLEEP_HOURS`, `SLEEP_QUALITY`, `FATIGUE`, `PHYSICAL_NOTES`; maximum one observation per field. Correction maintains the observation identity and increments the check-in revision.

Confirmation includes the IDs of only the observations the astronaut agrees to share. Even an empty selection is valid. The selection must belong to the current draft and cannot be changed after confirmation in the MVP. A subsequent correction of shared information requires a new check-in; a future rectification flow is outside this version.

The service builds `SharedCheckIn` with the confirmed selection and removes message references. The provider that generates reports and proposals receives only this projection, the sensors, and the program. It does not receive the diary, full transcript, or excluded observations. Private observations cannot appear even in the motivations of proposals visible to Earth.

Operational evidence are references to sensor readings or shared observations; they do not contain private phrases copied from messages. An inference uses `source: inference` and makes the evidence explicit. It is not a measured datum nor a diagnosis.

The diary is always `PRIVATE`, separate from the report, and correctable with revision control. Raw audio is not persisted. The text data retention policy will be agreed before using real data.

## Program constraints

The snapshot includes day window, version, and activities with times, priorities, `movable` flag, dependencies, and allowed window. Schemas check format and elementary ranges; the future `ScheduleValidator` must check constraints between activities and evidence.

Mandatory validator rules:

1. Activities cited exist in the astronaut's snapshot and inserted IDs are new.
2. Activities with `movable: false` or priority `CRITICAL` cannot be moved.
3. A move preserves duration and stays within the allowed window.
4. Dependencies exist, do not form cycles, and end before the dependent activity.
5. The result contains no overlaps and stays within day limits.
6. `ADD_REST` creates a `REST` activity, priority `LOW`, movable, without dependencies, with window equal to the day.
7. The proposal cites only sensors from the context and shared observations from the confirmed check-in.
8. The starting version matches the current one before the decision and application.

The AI candidate does not contain authorizations, proposal state, or decisions. The service assigns ID and state only after validating it. If the proposal is invalid, it is not published to Earth; the failure is handled explicitly, without applying a silent correction.

The examples in `examples/normal.json` fix a minimum program: Earth link immutable 08:00–08:30 UTC, flexible inventory 09:00–09:40. The proposal moves inventory to 09:20–10:00 and inserts a break 09:00–09:20. It is a demonstrative scenario, not a prescription.

## Identity and permissions

`IdentityProvider` returns a verified identity on the server:

- `ASTRONAUT`: `userId` and a single `astronautId`.
- `GROUND_CONTROL`: `userId` and explicit list of authorized astronauts.

The client cannot send `role` or `operatorId` in the body. `operatorId` of the decision derives from the verified identity. The astronaut ID in queries does not grant permissions: the service always verifies the scope.

Sessions, messages, full check-in, and diary are accessible only to the respective astronaut. Earth accesses proposals, decisions, and reports only for authorized astronauts. Sensor visibility in the dashboard will be handled by the respective module, not by access to the private conversation.

Missing authentication: 401. Disallowed role: 403. Nonexistent resource or belonging to another astronaut: 404. Identity simulations are allowed only in development and must fail at startup if enabled in production.

The concrete agreement on Fabrizio's login system remains outside C0: the interface is already defined and allows development with a local adapter.

## HTTP API

`AGENT_ENDPOINTS` in `contracts/endpoints.ts` is the executable catalog of methods, paths, roles, and schemas. All positive JSON responses use:

```json
{
  "data": {},
  "meta": { "contractVersion": "1.0.0", "requestId": "request-1" }
}
```

| Method and relative path | Body / query | Positive response |
| --- | --- | --- |
| `POST /sessions` | `{ astronautId }` | 201, session |
| `POST /sessions/:id/messages` | `{ clientMessageId, text, inputMode }` | 200, astronaut message, assistant response, check-in draft |
| `GET /sessions/:id` | `beforeMessageId?` | 200, session state |
| `PATCH /check-ins/:id` | `{ expectedRevision, observations }` | 200, updated draft |
| `POST /check-ins/:id/confirm` | `{ expectedRevision, sharedObservationIds }` | 202, session state and generation |
| `GET /proposals` | `astronautId`, `cursor?`, `limit?` | 200, proposals page |
| `POST /proposals/:id/decision` | `{ decision, comment }` + `Idempotency-Key` | 200, decision, proposal and applied program or `null` |
| `GET /reports` | `astronautId`, `cursor?`, `limit?` | 200, reports page |
| `GET /diary` | `astronautId`, `cursor?`, `limit?` | 200, private diary page |
| `PATCH /diary/:id` | `{ expectedRevision, text, status }` | 200, updated entry |
| `POST /voice/transcriptions` | multipart: `audio`, `sessionId`, `durationSeconds` | 200, `{ text, language }` |
| `POST /voice/speech` | `{ sessionId, messageId }` | 200, binary `audio/mpeg` |

`PATCH /check-ins/:id` replaces the entire draft observation array; it does not modify other fields. The service verifies that IDs and message references belong to this session and maintains provenance even for manual corrections. A subsequent change after confirmation returns `INVALID_STATE`.

Pages use `{ items, nextCursor }`, stable ordering by descending creation date and ID as tiebreaker, default limit 20 and maximum 100. The cursor is the ID of the last returned item. Session messages are paginated in groups of maximum 200, returned in chronological order within the page; `nextMessageCursor` allows loading the previous page. No private content enters URL parameters.

An MVP session accepts messages until the check-in is in draft; after confirmation a new session is opened. This avoids changing the context of an already confirmed report. The diary is accessible and modifiable also later.

### Confirmation and asynchronous generation

Confirmation returns 202 without waiting for the model. `GET /sessions/:id` exposes `generationStatus`: `NOT_STARTED`, `PROCESSING`, `READY`, `FAILED`.

With `READY`, report and diary always exist. If `proposal` is `null`, `noChangeReason` must explain the absence of changes. During `PROCESSING` a `null` value does not mean the agent decided not to intervene. The interface can poll every 2 seconds, stopping on `READY` or `FAILED`.

Identical confirmation can be repeated to recover state and, with failed generation or expired lease, request a new attempt. The original selection and submitted revision must match the first confirmation. The repository acquires a generation lease and performs atomic saving of artifacts once per check-in. A worker with expired lease cannot publish results.

## Errors

Every JSON error uses `ApiErrorSchema`. `ERROR_HTTP_STATUS` defines the mapping between application code and HTTP code. `issues` can be empty; it must not include personal values. `requestId` allows correlating technical logs without transcripts.

Complete conflict example: `examples/stale.json`, HTTP 409 `VERSION_CONFLICT`, with `currentVersion`. A new proposal requires a new approval; retrying the old one does not resolve the conflict.

## Decision, application, and retry

```text
PENDING_REVIEW -> REJECTED
PENDING_REVIEW -> APPROVED -> APPLIED
PENDING_REVIEW -> STALE
APPROVED      -> STALE | APPLY_FAILED
APPLY_FAILED  -> APPLIED | STALE
```

1. Earth sends `APPROVE` or `REJECT` with a stable idempotency key for that action.
2. The service verifies identity, scope, state, and program version.
3. If already obsolete, marks the proposal `STALE` and responds 409 without recording a new approval.
4. Otherwise records decision and state in a transaction. The decision is immutable.
5. Only for `APPROVE` invokes `ScheduleProvider.applyApproved` through a trusted server boundary; the provider verifies the authorized decision and checks the version again in the same transaction as the modification.
6. Records the outcome. If a concurrent modification intervenes after the decision, the decision remains in the audit and the proposal becomes `STALE`.

Reused key with different payload or operator: 409 `IDEMPOTENCY_CONFLICT`. Decision incompatible with the already recorded one: 409 `INVALID_STATE`. An identical repetition returns the original decision and current state, without new effects. The key is associated with proposal, operator, and normalized payload.

The program adapter deduplicates by `proposalId`/`decisionId`, also comparing the command: a different command with the same pair is a conflict. Version check, writing, and durable receipt must be atomic in the authoritative program system.

Adapter outcomes: `APPLIED`, `STALE`, `FAILED`, `UNKNOWN`. A timeout after a possible send produces `UNKNOWN`: the proposal remains `APPROVED`, the interface shows application under verification, and the service reconciles via `getApplication`. Do not mark `APPLY_FAILED` when the outcome is only unknown. `FAILED` is reserved for a certain failure.

An application retry always uses the same decision and same command, reconciles the outcome first, and does not override version constraints. For the MVP it can be activated by repeating the same decision request. The service does not keep SQLite transactions open during external calls.

With `APPLIED`, `DecisionResult.schedule` contains the updated program and `appliedScheduleVersion` is valued. In other states `schedule` is `null`; reading the current program remains the responsibility of the program system. Only `APPLIED` allows announcing to the astronaut that the change is effective.

## Voice

Turn-based recording: record, transcribe, show correctable text, send via the same messages API with `inputMode: VOICE`. Messages are not sent twice at the end of transcription.

Limits: 10 MiB, 120 seconds, provider timeout 30 seconds. Allowed MIMEs: `audio/webm`, `audio/webm;codecs=opus`, `audio/mp4`, `audio/wav`, `audio/mpeg`. The route derives MIME and size from the file and verifies content and actual duration; the client-declared duration is not authoritative. A provider unable to handle the format must convert it server-side or respond with `UNSUPPORTED_AUDIO`.

Synthesis can read only `ASSISTANT` messages of the astronaut's session. HTTP output `audio/mpeg`, `Cache-Control: no-store`; any different provider format is converted by the adapter. It is not a public endpoint for synthesizing arbitrary text. Positive audio responses have no JSON envelope; errors do.

## Example files and checks

- `examples/normal.json`: requests, context data, proposal, decision, report, and diary of a path with variation.
- `examples/normal-response.json`: positive HTTP response after applying the variation.
- `examples/no-change.json`: `READY` status response without proposal, with explicit motivation.
- `examples/stale.json`: HTTP 409 error for obsolete proposal.

Tests must validate these examples against schemas and reject ambiguous inputs: role in body, out-of-range scales, sensors with wrong units, private content in operational context, inconsistent application metadata. These are shared boundary tests; transaction and actual authorization tests belong to N1/N2.

```text
npm ci
npm run test:agent
npm run typecheck
npm run lint
```

In PowerShell, if the policy prevents execution of `npm.ps1`, use `npm.cmd` in the same commands. Lint excludes the generated file `next-env.d.ts`, which must not be modified manually.

## Delivery and responsibilities

- You: implement `AiProvider`, `VoiceProvider`, orchestration, report/diary, and demo using these contracts.
- Nello: implements repository, validator, simulated providers, and approval cycle using `ports.ts`.
- Nello remains the contact for shared changes to contracts and dependencies after this initial base; agree on every incompatible change before integrating it.
- Fabrizio: connects the dashboard to the APIs and agrees on identity and program adapters; no demo graphic component is mandatory.

To be confirmed with Fabrizio: actual login, owner of the authoritative program and related transactional mechanism. AI/voice provider and real data temporal retention will be chosen before respective implementations; they do not modify the DTOs of this version.

Validation library reference: [official Zod documentation](https://zod.dev/basics).
