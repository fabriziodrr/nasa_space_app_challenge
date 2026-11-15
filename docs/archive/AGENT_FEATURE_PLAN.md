# Edge AI Assistant: specification and implementation plan

## Objective

Create a voice assistant with which the astronaut can talk about sleep, physical condition, and their day. The assistant combines what is reported with simulated sensor data and the schedule defined from Earth, produces an operational report and a diary, and, when appropriate, proposes a schedule change.

The change becomes effective only after approval from the control room and confirmation of application by the system that manages the schedule.

The module must be usable without Fabrizio's dashboard. His dashboard will be connected later through shared APIs and contracts, without rewriting the agent logic.

## Repository context

- Next.js App Router, React and TypeScript.
- Prisma with SQLite, currently without application models.
- `server/` and `components/` folders still empty.
- No AI or voice integration implemented.
- `db:seed` refers to `prisma/seed.ts`, which must still be created.

The work concerns agent functionality and a technical test page. The product dashboard remains under Fabrizio's responsibility.

## Expected experience

1. The astronaut starts a text or voice conversation.
2. The agent retrieves sensors, schedule, and authorized previous check-ins.
3. The astronaut describes rest and how they feel; the agent asks for clarification when needed.
4. The agent prepares a structured check-in, correctable by the astronaut.
5. After check-in confirmation, it generates an operational report and a diary draft; it can also generate a change proposal.
6. The backend validates the proposal against schedule constraints.
7. Earth reads motivation, evidence, and before/after comparison and approves or rejects.
8. If approved and still valid, the system applies the change and records the outcome.
9. The astronaut receives a confirmation consistent with the actual state.

Demonstrative example: the astronaut reports fragmented sleep and fatigue; the agent investigates, proposes moving a flexible activity and inserting a schedule-compatible break; Earth approves and the new schedule version is returned to both views.

## First MVP scope

Included:

- One demonstrative astronaut, one day, and an initial schedule defined from Earth.
- Three reproducible sensor scenarios.
- Text conversation and subsequent addition of Italian voice input/output.
- Structured check-in with confirmation or correction.
- Optional proposal, validation, and approval/rejection from Earth.
- Persistence of messages, check-ins, proposals, decisions, reports, and diary.
- Memory limited to a configurable number of messages and authorized previous check-ins.
- Page `/agent-demo` independent from Fabrizio's dashboard.
- API contract and examples for integration.

Deferred:

- Final dashboard and integration with real sensors.
- Continuous audio conversation with interruptions and real-time streaming.
- Automatic optimization of the entire mission schedule.
- Multi-agent system, vector database, and model training.
- Diagnosis, prescriptions, or clinical efficacy claims.
- Fully offline AI model operation; in the MVP a network error is handled explicitly.

## Implementation principles

### Data and interpretation

- Always distinguish `sensor`, `self_report`, and `inference` as information origin.
- Preserve timestamps, units of measure, and evidence references.
- Do not replace an astronaut's statement with a discordant measurement, or vice versa.
- If data is missing, record it as absent; do not invent values.
- Use explicitly demonstrative scenarios and thresholds, not presented as clinical criteria.
- Do not infer diagnoses or certain psychological states from text or voice tone.
- In the presence of elements requiring human evaluation, produce a dedicated report; do not treat every problem as a simple schedule change.

### Authority over the schedule

- The agent can read the schedule and create proposals; it does not have a tool to apply or approve them.
- The code checks overlaps, blocked activities, dependencies, duration, and day limits.
- Every proposal contains the schedule version it derives from.
- An approval is not an already applied update.
- Application requires an atomic version check and must be idempotent.
- If the schedule has changed, the proposal becomes obsolete and must be regenerated and re-approved.
- Once pending decision, the proposal content is immutable; a revision creates a new proposal.

### Companionship, diary, and sharing

- The agent presents itself as an artificial assistant and encourages human contacts.
- Personal diary and operational report are distinct objects.
- The diary is private by default and is not readable by Earth APIs.
- The full conversation is private by default: personal context is not automatically transferred to the report.
- The confirmed check-in identifies shareable operational information; Earth reads the report derived from that information, not the full transcript.
- Before confirmation, the astronaut can verify and correct extracted data.
- For the MVP, raw audio is not stored; only the textual data necessary for the flow is saved. Do not include conversations or sensitive data in technical logs.

## Proposed architecture

```text
server/agent/
  contracts/           Schemi validati e tipi pubblici
  core/                Orchestrazione della conversazione
  prompts/             Istruzioni e formati di estrazione
  services/            Check-in, proposte, report e diario
  adapters/            AI, voce, Prisma, sensori e programma
  simulator/           Scenari riproducibili

app/api/agent/         Route HTTP sottili
app/agent-demo/        Pagina tecnica di prova
components/agent-demo/ Componenti della sola demo
docs/agent/            Contratto API ed esempi di integrazione
prisma/               Schema e seed dimostrativo
```

The module core does not import React components, Next.js request/response objects, or the Prisma client. Routes handle authentication, validation, and HTTP conversion; adapters manage external services and persistence.

Main interfaces:

| Interface | Responsibility |
| --- | --- |
| `AiProvider` | Conversational response and validated structured output |
| `VoiceProvider` | Audio transcription and response synthesis |
| `SensorProvider` | Available readings for astronaut and interval |
| `ScheduleProvider` | Schedule reading and authorized application with expected version |
| `AgentRepository` | Persistence of sessions and module results |
| `IdentityProvider` | Verified identity and role on the server |

Simulated adapters allow development without AI keys. Real credentials are read on the server from environment variables and are never sent to the browser. Public types must be importable without dragging server dependencies into the frontend.

### Boundary with Fabrizio's program

In the MVP `ScheduleProvider` uses the simulated schedule. During integration it will be replaced with the implementation agreed with Fabrizio.

The application operation receives `proposalId`, `decisionId`, `expectedScheduleVersion` and the validated changes. The authoritative schedule manager must check the version and prevent duplicate application in the same transaction. The agent records the confirmed outcome and can reconcile it by identifier after a timeout, without assuming the operation failed or succeeded.

## Minimum data contracts

| Object | Main fields |
| --- | --- |
| `SensorReading` | ID, astronaut, timestamp, metric, value, unit, quality, scenario |
| `ScheduleSnapshot` | ID, astronaut, date, time zone, version, activities |
| `ScheduleActivity` | ID, start/end, title, priority, movable, dependencies and constraints |
| `ConversationSession` | ID, astronaut, opening/closing |
| `ConversationMessage` | ID, session, role, text, timestamp, text/voice origin |
| `CheckIn` | ID, session, draft/confirmed status, reported sleep, quality, fatigue, discomforts, evidence and missing data |
| `ScheduleProposal` | ID, check-in, starting version, changes, motivation, evidence, status |
| `ProposalDecision` | ID, proposal, approval/rejection, operator, timestamp, comment |
| `GroundReport` | ID, confirmed check-in, operational summary, discrepancies, uncertainties, associated proposal |
| `DiaryEntry` | ID, astronaut, date, text, draft/confirmed status, private visibility |

Subjective fields have no pre-filled values. Any scales, for example from 1 to 5, are defined in the contracts and explained to the astronaut before use.

Use ISO 8601 timestamps in UTC and an explicit time zone in the schedule. Agree on enums and error format before developing the two work branches.

### Proposal states

```text
PENDING_REVIEW -> REJECTED
PENDING_REVIEW -> APPROVED -> APPLIED
PENDING_REVIEW -> STALE
APPROVED      -> STALE
APPROVED      -> APPLY_FAILED
APPLY_FAILED  -> APPLIED       (solo retry della stessa operazione, se ancora valida)
APPLY_FAILED  -> STALE
```

An invalid proposal is discarded before entering `PENDING_REVIEW`. Only `APPLIED` authorizes the message "The schedule has been updated". A repeated decision must not create new effects; a decision incompatible with the one already recorded returns a conflict.

## API to be agreed in the first activity

Proposed prefix: `/api/agent/v1`. The final contract must include complete JSON examples, roles, HTTP codes, and errors.

| Method and path | Usage |
| --- | --- |
| `POST /sessions` | Opens a session for the authorized astronaut |
| `POST /sessions/:id/messages` | Sends text; returns response, check-in draft, and status |
| `GET /sessions/:id` | Retrieves the status of one's own session |
| `PATCH /check-ins/:id` | Corrects a draft |
| `POST /check-ins/:id/confirm` | Confirms shareable data and starts result production |
| `GET /proposals` | Lists proposals visible to the current identity |
| `POST /proposals/:id/decision` | Records an Earth decision and attempts application if approved |
| `GET /reports` | Retrieves reports authorized for Earth or for the relative astronaut |
| `GET /diary` | Retrieves the diary of only the authenticated astronaut |
| `PATCH /diary/:id` | Corrects or confirms one's own diary entry |
| `POST /voice/transcriptions` | Converts audio to text, to be sent then to the normal messages API |
| `POST /voice/speech` | Produces audio of an authorized agent response |

Voice APIs use the same services as the text path. Define allowed audio formats, maximum size/duration, timeouts, and response format. Synthesis receives a reference to an accessible message, not arbitrary text from other users.

The role is not accepted from the request body. A simulated identity can be used only in the local demo, explicitly enabled and disabled in production. The demo page is not an authentication system.

For the MVP, HTTP requests and polling updates are sufficient; streaming and push events are subsequent extensions. The status API must allow retrieving the result after timeout or page reload.

## Work division

Proposed assignment: **you follow AI conversation, voice, and demo; Nello follows data, schedule, proposals, and approval**. Contracts are defined together before proceeding in parallel. Fabrizio manages the final dashboard.

### C0 — Initial contracts and agreements — You + Nello

- [x] Define input/output schemas, enums, errors, and adapter interfaces.
- [x] Define shareable information in the check-in and private information.
- [x] Define schedule format, constraints, and allowed operations in the MVP.
- [x] Prepare JSON examples for normal path, no proposal, and obsolete proposal.
- [ ] Agree with Fabrizio on the integration boundary for identity and schedule, without blocking simulated adapter development.
- [x] Choose the test runner and add a common script for module tests.
- [x] Assign a single referent for changes to `contracts/` and `package.json`: Nello in the initial phase.

Available technical base: [Contracts v1](../agent/contracts-v1.md), schemas in `server/agent/contracts/`, interfaces in `server/agent/ports.ts`, examples in `docs/agent/examples/`. HTTP routes and adapters are contracts to implement in subsequent tasks. The comparison with Fabrizio remains to be carried out: no external agreement has been assumed.

Completed when both can implement using the same examples and the same signatures, without depending on the other's internal work.

### T1 — Text conversation and AI provider — You

Dependency: C0.

- [x] Implement `AiProvider`, a simulated adapter and a real configurable one.
- [x] Implement the orchestrator with limited and authorized context.
- [x] Write instructions for conversation, clarification, and check-in extraction.
- [x] Validate model structured output; handle invalid output and timeout without creating malformed proposals.
- [x] Handle missing information, discordant data, and the case where no change is needed.
- [x] Expose session and message APIs using the agreed persistence interfaces.

Implementation and test: [T1 guide](../agent/t1-conversation.md). The runtime uses Prisma with demonstrative sensors and schedule. The main real provider is NVIDIA Nemotron; OpenAI remains optional for conversation. `npm run test:agent:live` allows repeating the test with your own key and an already running local server.

Completed when a text scenario produces a useful response and a correct check-in draft, without being able to apply schedule changes.

### N1 — Persistence and simulated scenarios — Nello

Dependency: C0.

- [x] Define Prisma models and database initialization path.
- [x] Implement `AgentRepository` and record access checks.
- [x] Create `prisma/seed.ts` with astronaut, demo identity, and consistent schedule.
- [x] Implement `SensorProvider` and `ScheduleProvider` simulated.
- [x] Prepare three deterministic scenarios: regular rest, insufficient rest, discordant data.
- [x] Document setup, demonstrative data reset, and startup.

Implementation and test: [N1 guide](../agent/setup.md). Models in `prisma/schema.prisma`, `AgentRepository` in `server/agent/adapters/prisma/repository.ts`, simulated providers in `server/agent/adapters/` (`sensors.ts`, `schedule.ts`, `identity.ts`) and scenarios in `server/agent/simulator/scenarios.ts`. Tests in `tests/agent/n1.test.ts`. Prisma persistence is not yet connected to the HTTP runtime (uses `MemoryConversationRepository`); the connection occurs in integration with T4/N3.

Completed when data survives restart and every scenario can be repeated with the same inputs.

### T2 — Report, diary, and companionship behavior — You

Dependencies: T1; N1 for real saving. Can start with simulated repository.

- [x] Generate report and diary draft from confirmed check-in and authorized context.
- [x] Distinguish in the report measurements, statements, discrepancies, and interpretations.
- [x] Implement a companionship behavior that recognizes its artificial nature and maintains continuity with authorized conversations.
- [x] Do not insert into the report private content foreign to the shareable check-in.
- [x] Expose diary retrieval and modification and report retrieval, with related access checks.
- [x] Handle regeneration without duplicating reports or entries of the same check-in.

Guide and test: [report and diary T2](../agent/t2-report-diary.md). Generation uses NVIDIA or mock; text requires human review. The runtime schedule is demonstrative and change proposals are not yet connected.

Completed when the astronaut can correct the diary and Earth receives only the expected report.

### N2 — Check-in, validator, and approval cycle — Nello

Dependencies: C0 and N1. Uses initially simulated proposals, without waiting for T1.

- [x] Implement check-in correction and confirmation, preventing duplicate effects on repeated confirmations.
- [x] Implement the service that receives the structured proposal generated by the agent.
- [x] Validate existing activities, blocks, dependencies, durations, overlaps, and day limits.
- [x] Save an immutable proposal with evidence and schedule version.
- [x] Implement proposal list and approved/rejected decision.
- [x] Verify Earth role on the server and record operator, time, and comment.
- [x] Apply with atomic version control and duplicate protection in the simulated adapter.
- [x] Handle obsolete proposal, application failure, and outcome recovery after timeout.
- [x] Return status and effective schedule, distinguishing approval and application.

Implementation and test: validator in `server/agent/services/validator.ts`, services in `server/agent/services/` (`checkin.ts`, `proposals.ts`, `approval.ts`) and application with atomic version control in the simulated adapter `server/agent/adapters/schedule.ts`. Tests in `tests/agent/n2.test.ts`. Proposal/decision/report HTTP routes remain for integration with T4/N3.

Completed when a valid proposal is applied once and an obsolete or unauthorized proposal does not modify the schedule.

### T3 — Voice interface — You

Dependency: T1 stable; can proceed in parallel with N2.

- [x] Implement `VoiceProvider` and server transcription and synthesis routes.
- [x] Handle microphone permission, recording, sending, and playback.
- [x] Show transcription and allow correction before sending.
- [x] Always keep text input available.
- [x] Handle denied permission, empty audio, unsupported format, timeout, and double sending.
- [x] Set audio limits and avoid saving or logging raw audio.

Implementation and test: [Voice guide](../agent/t3-voice.md). Practical verification requires a compatible browser; NIM routes require separate local services.

Completed when the voice path uses the same services and produces the same objects as the text path.

### T4 — Independent test page — You

Dependencies: T1 and API contracts; progressive connection with N1 and N2.

- [ ] Create `/agent-demo` with scenario choice, chat, and voice controls.
- [ ] Show extracted data and check-in correction/confirmation.
- [ ] Show proposal, report, and diary according to permissions.
- [ ] Add a technical Earth view for approval and rejection, clearly marked as demo.
- [ ] Show original schedule, proposed schedule, and actually applied schedule.
- [ ] Handle loading, error, no proposal, and status update.
- [ ] Isolate the demo from production authentication and the future dashboard.

Completed when the full path is demonstrable without Fabrizio's code.

### N3 — Integration documentation — Nello

Dependency: C0; final update after N2 and T3.

- [x] Write `docs/agent/integration.md` with endpoints, payloads, responses, and errors.
- [x] Include call examples for session, check-in, proposal, decision, and status retrieval.
- [x] Document configuration, environment variables, and simulated/real mode without secrets.
- [x] Explain how to replace identity, sensor, and schedule providers.
- [x] Explicitly state transactional responsibilities, idempotency, and application reconciliation.
- [ ] Agree with Fabrizio on connecting to the dashboard using the same endpoints as the demo.

Implementation and test: [Integration guide](../agent/integration.md). Updated after T3 (voice section, `AGENT_VOICE_PROVIDER`/`AGENT_NIM_*` variables). Remain to document as "exposed" only routes `GET /proposals` and `POST /proposals/:id/decision`. The agreement with Fabrizio (real login and authoritative schedule backend) remains open.

Completed when Fabrizio can connect his own view without importing demo graphic components or modifying the agent core.

### C1 — Final verification — You + Nello

- [ ] Run the three scenarios and verify results and persistence.
- [ ] Verify rejection, double approval, schedule changed meanwhile, and failed application.
- [ ] Verify that an astronaut cannot approve and Earth cannot read the private diary.
- [ ] Verify that the agent does not have direct write access to the schedule.
- [ ] Verify missing data, invalid AI output, and provider unavailability.
- [ ] Verify that report and diary do not contain invented information or private content transfers.
- [ ] Run lint, TypeScript check, relevant tests, and build.
- [ ] Test startup from a clean checkout following the documentation.

## Recommended work order

1. Close C0 and merge shared contracts.
2. Proceed in parallel with T1 and N1, using simulated adapters.
3. Connect conversation and persistence; develop T2 and N2 in parallel.
4. Complete the text path up to approved application.
5. Add T3 and complete T4; update N3 during development.
6. Execute C1 and deliver demo and documentation to Fabrizio.

Each task should become an issue or a PR with the relative identifier in the title. Avoid concurrent changes to Prisma schema and contracts; communicate every API variation before integrating it.

## MVP acceptance criteria

- The astronaut can complete a check-in with voice or text.
- Declared data and sensor data remain distinguishable and correctable where provided.
- The agent can decide not to propose any change.
- A proposal shows motivation, evidence, and differences compared to the current schedule.
- The schedule does not change before an authorized Earth decision.
- A rejected, duplicate, or obsolete proposal does not produce improper changes.
- The interface communicates the update only after application confirmation.
- Operational report and personal diary are persisted with distinct accesses.
- The flow works with simulated providers and has a configurable real AI/voice path.
- Fabrizio can integrate the functionality using the HTTP contract and documented adapters.

## Decisions still to be fixed in C0

- Provider and models for conversation, transcription, and voice synthesis.
- Sensor metrics and subjective scales actually used in the demo.
- Activities and constraints of the demonstrative scenario.
- Shared authentication system with the dashboard.
- Who owns the authoritative schedule backend during integration.
- Retention limits for transcripts, check-ins, and diary.

These decisions do not prevent starting contracts and simulators; no key or dashboard dependency is necessary for the first simulated path.
