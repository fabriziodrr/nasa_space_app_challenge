# Knowledge plan: AEGIS backend unification

Status: analysis and proposal, not yet implemented. Base: branch `emanuel_fix_agent` and local modifications present at the time of analysis. Before implementation, verify any changes Matteo may have introduced. Sleep Recovery view and analysis are a constraint: do not rewrite them or alter their base results.

## Objective

Prepare a single backend point to acquire available context, correctly associate profile and session, produce a coherent snapshot, and feed report writing starting from ocular observations, already present synthetic data, and astronaut statements. The interface must not require manual tokens or JSON files.

A common backend is a single logical boundary for consumers; it does not immediately require physically merging the two databases. The first proposed implementation maintains ownership of existing data and unifies reading, authorization, snapshot, and report generation. A possible migration to a single archive is a separate phase, to be designed without interrupting Sleep Recovery.

## Verified inventory

| Component | Status and responsibility |
| --- | --- |
| Vision | MediaPipe Face Landmarker float16 v1, local file `feature-visione-palpebrale/vision-prototype/public/models/face_landmarker.task` and WASM. The asset SHA-256 hash matches the one declared in the code. The prototype calculates ocular metrics with `TemporalEngine`; it is not a language model. |
| Vision import | The host receives the prototype summary, the worker validates it, and `VisionService` saves observation and selection in Prisma. Usability is being reevaluated; webcam, synthetic replay, insufficient data, and old data remain distinguishable. |
| Speech | Browser recognition produces text; optional transcription/synthesis adapters exist. `inputMode=VOICE` identifies a transcribed voice message, not an acoustic measure of emotion or fatigue. |
| Conversation | `AGENT_AI_PROVIDER` selects mock, NVIDIA, or OpenAI. In the local file NVIDIA is selected with Nemotron and a configured key; this does not prove the live call works. The model receives structured context and proposes verifiable and correctable observations. |
| Drafting | `ArtifactService` generates operational report and separate diary using NVIDIA or mock. The current OpenAI provider implements only conversation: with OpenAI the runtime does not enable `ArtifactService`. Do not assume all providers write reports. |
| Python data agent | `data_agent.py` is a deterministic LangGraph workflow, not an LLM. It composes sleep, confirmed feedback, and vision; cross-conclusion is currently null. `companion.py` can use a separate Ollama model: it requires configuration and local service; in the examined environment the Ollama service did not respond. |
| JSON data | `server/examples/` contains synthetic fixtures; they do not represent an active sensor. Dashboard cognitive state and vigilance also include fictitious profiles in `server/examples/crew_profiles.ts`. |
| Persistence | Python SQLite preserves observations and serves Sleep Recovery. Prisma/SQLite preserves sessions, messages, check-ins, vision selections, snapshots, and reports. There is currently no single physical archive. |

The existence of a model or adapter does not equate to verification of its accuracy, live availability, or correct integration with Matteo's site.

## Flows and gaps

1. **Eyes:** authorized webcam and calibration → MediaPipe landmarks → temporal metric → validation, selection, and Prisma persistence → conversation context. At check-in, the measure enters the snapshot destined for Terra only if explicitly shared. The demo Python report reads the selection through an HTTP bridge; that path must not be considered equivalent to Terra report authorization.
2. **Synthetic data:** the Python service validates and preserves imported examples and produces `agent-context`; `PythonSensorProvider` translates them for the agent module. Fixtures must preserve demo subject, origin, units, timestamp, and synthetic indication, without automatically becoming a verified personal history.
3. **Voice:** browser or provider → transcription → `VOICE` message → conversation → check-in proposal → review/confirmation → operational report based only on shared observations. There is no automatic synchronization between Prisma check-in and Python `SpeechFeedback`. The isolated end-to-end test showed `reported_state=missing`; the code confirms the absence of the link. A vague phrase does not by itself provide a numerical scale.
4. **Report:** an operational report/diary in Prisma coexists with a deterministic Python report. The demo report looks for the last profile selection across sessions, while the operational report uses the check-in session. Furthermore, Python `snapshot_id` identifies only Python data: it does not necessarily change when vision is read separately. There is not yet a single drafting that consumes the same common snapshot with consistent provenance and permissions.

Risk to correct before using scales: `server/agent/core/conversation-service.ts` assigns `scaleMax: 10` to new fatigue and sleep quality observations without verifying that the scale declared by the provider is 10. Validate value, scale, and message reference, and keep ambiguity as unconfirmed data. Current message reference validation does not by itself demonstrate that the message content semantically supports the extracted number.

## Proposed solution for the next intervention

1. **Detect updated state.** Re-examine branch, local files, and actual integration of Matteo's online agent; do not overwrite concurrent changes nor assume the actual provider. Census current contracts and Sleep Recovery results as baseline.
2. **Common contract and identity.** Define a versioned server-side snapshot with `astronautId`, associated data subject, `sessionId`, timestamp/window, observation IDs, source, units, quality, synthetic state, confirmation, availability, and authorization. Resolve profile mapping on the server; demo mapping is not real identity verification. Distinguish missing, expired, invalid, and service unavailable.
3. **Reading without changing Sleep Recovery.** Integrate Python data through the existing service/API in read-only mode, preserving current sleep analysis calculation and response. Integrate validated vision and check-in confirmed observations from Prisma through explicit adapters. Do not write voice feedback to the Python archive as a side effect if it alters the view or Sleep Recovery results.
4. **Voice and confirmation.** Reuse existing transcribed text and check-ins: extraction initially as draft with message references; transfer to context only explicit values, with correct scale and confirmation status. Keep text notes with provenance where useful, without inventing scores, turning a model inference into a statement, or labeling synthetic speech as real. Design any acoustic metrics separately only when the relative component and contract exist.
5. **Snapshot and report.** Upon confirmation, build and freeze the authorized context, preserving private data and separate consent for Terra; reuse and adapt `ArtifactService` and evidence validations. A single report must indicate sources, times, quality, missing data, uncertainties, and synthetic nature, without treating eye closure as diagnosis or direct sleep measure. The diary remains private. The selected provider must explicitly support drafting, otherwise the state must declare it.
6. **Reliability.** Avoid non-atomic duplicate writes between the two databases. If in the future event replication between archives is decided, use stable identifiers, idempotency, and a persistent outbox/queue with retry and reconciliation. Network and model calls remain outside DB transactions.
7. **Interface.** Connect Matteo's site to the same backend contract and remove residual dependencies on sessions or manual inputs in the only necessary integration. Do not touch the base Sleep Recovery part.

## Required verifications before declaring finished

- Sleep Recovery view regression test and same fixture results, including absence and backend unavailable.
- Full flow with single demo profile: synthetic fixture, valid vision measure or explicitly synthetic, transcribed voice message with explicit and correct score, confirmation, and report; verify contents, sources, and identifiers, not only HTTP 200.
- Test absence of feedback, ambiguous values and different scales, modified observation, retry and duplicates, old or insufficient measures, Python service offline, astronaut isolation, and missing consent to sharing.
- Verify that astronaut report, Terra report, and diary respect respective authorizations. A demo data report selecting the astronaut profile must not bypass the sharing choice toward Terra.
- Provider tests: mock for reproducibility, NVIDIA actually configured and available when authorized; possible OpenAI only if the provider will also support operational methods. Ollama is not required for the deterministic workflow, but serves if the Python companion is used.
- Browser testing with actual webcam and microphone, permissions, stop/interruption, measure quality, error handling, and reload; measure quality and do not confuse simulation with physical proof.

## Evidence and entry points

- `server/agent/runtime.ts`, `server/agent/ports.ts`, `server/agent/core/conversation-service.ts`.
- `server/agent/vision/service.ts`, `server/agent/vision/confirmation.ts`, `server/agent/services/artifacts.ts`.
- `server/src/aegis_data/models.py`, `service.py`, `data_agent.py`, `integrated_context.py`, `vision_bridge.py`.
- `prisma/schema.prisma`, `docs/agent/contratto-backend-dati.md`, `docs/SPEECH_DATA_CONTRACT.md`.
- `tests/agent/` and `server/tests/`; previous verifications included 134 agent tests, 47 Python tests, and an isolated HTTP test with synthetic data. No physical webcam/microphone test was performed in this session.
