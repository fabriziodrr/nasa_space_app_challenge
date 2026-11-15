# I0 — Vision / agent integration contract

Status: technical decisions fixed for I1–I6; path I1 uses the versioned copy described in the [I1 guide](i1-vision-import.md). Executable contract: `server/agent/contracts/vision.ts`.

## Source distribution

The feature is included directly in the `feature-visione-palpebrale/` folder of the main repository, with v2 parser, agent linkage, model, and WASM assets. A normal clone/pull retrieves the sources without access to another repository and without submodule commands. The origin revision is `9803a5f41eff521db5d1305af82323da11332eb5`; the distributed version is now that of the main repository commit. Prototype npm dependencies are installed separately, as described in the [README](../../README.md#visione-palpebrale-inclusa).

I1 uses a declared and verifiable hash copy of pure modules and a compiled worker, described in the [I1 guide](i1-vision-import.md). The 20 TypeScript sources of the copy were compared with the published commit and match, normalizing line endings. The copy remains available in the backend; future updates must keep sources, hashes, and worker aligned. No webcam, React, or MediaPipe runtime is imported into the backend.

## Acquisition and limits

I1 exposes `POST /api/agent/v1/sessions/{sessionId}/vision-observations`, `Content-Type: application/json` with `crewready-session-v2` JSON as body, and a mandatory `Idempotency-Key`. Authentication and astronaut come from the server, not from the file. The `GET` of the same path is owner-only. The export must belong to the requested session by server-operated association; imported content does not prove the identity of the person filmed.

The route reads at most 10 MiB UTF-8 even in streaming, rejects larger requests with `PAYLOAD_TOO_LARGE`, allows at most 18,000 samples and 18,001 performance samples, and accepts only session v2 / C01 v2. The API limit is more restrictive than the parser's 50 million characters. Before processing, reject malformed JSON and excessive counts. The entire parsing and synchronous replay must run in an isolated worker terminable after 5 seconds; a race with a timer in the same thread does not interrupt CPU work. Reject timeouts with `PROVIDER_TIMEOUT`, invalid version or content with `VALIDATION_ERROR`, nonexistent/other session with `NOT_FOUND`, concluded session with `INVALID_STATE`. No raw payload in logs or error messages.

SHA-256 is calculated by the server on received bytes; retry with same key and same bytes returns the same result, same key and different bytes gives `IDEMPOTENCY_CONFLICT`. Different bytes with same JSON content are not considered identical. Digest and validation prove integrity/consistency, not origin authenticity.

## Time and quality

For webcam, `startedAt` and `endedAt` derive from `timeOriginUnixMs + snapshot.session.startMs/endMs`, converted to UTC; both values are null if the interval does not exist. Reject impossible intervals, in the future beyond 5 minutes or after export beyond the same tolerance. The tolerance serves clock misalignment, does not guarantee time authenticity. Synthetic replay keeps `startedAt` and `endedAt` null: do not invent a real date. `exportedAt` is converted to UTC if valid; `importedAt` is assigned by the server.

Initial experimental parameters fixed and server-configurable: at least 30,000 ms valid, coverage at least 0.70, end measurement within the last 120 minutes. `NO_VALID_TIME`, `TOO_SHORT`, `LOW_COVERAGE`, `STALE`, `INTERRUPTED` are cumulative reasons; `user_stop` is a regular conclusion, other interruption reasons make the measurement insufficient. Synthetic fixtures remain `INSUFFICIENT` with `SYNTHETIC_TIME_UNAVAILABLE` in the operational path; they can be shown in the demo and used in dedicated tests, clearly labeled. Do not invent fatigue thresholds. Quality calculation is fixed relative to confirmation instant and recorded in the frozen context: usability can change over time.

## Selection, sharing, and compatibility

Selection consists of `{ visionObservationId: string | null, shareWithGround: boolean }`; `true` requires an ID. I1 extends the confirmation payload with `vision`, verifying that the measurement belongs to astronaut and session. The expected revision protects selection, observations, and confirmation simultaneously. If absent in v1 payload, the compatibility adapter interprets `{ visionObservationId: null, shareWithGround: false }`. Selection is immutable after confirmation; identical retries return the same result, subsequent changes are conflicts.

Confirmation atomically saves an immutable copy of shared observations, selected sensors, and authorized vision summary, with quality and criteria used. Generation and retries read exclusively from the snapshot. For historical check-ins already confirmed without snapshot, an explicit migration must mark the context as `LEGACY_UNAVAILABLE`; do not reconstruct it tacitly with current data. Define a regeneration or new check-in path before modifying existing behavior.

New vision routes use `/api/agent/v1/sessions/{sessionId}/vision-observations` and the existing v1 envelope. Extended confirmation uses **`POST /api/agent/v2/check-ins/{id}/confirm`**, with body validated by `ConfirmCheckInWithVisionRequestSchema` and envelope `meta.contractVersion: "2.0.0"`. The response `data` contains `{ checkIn, vision }`: `checkIn` maintains v1 shape, `vision` is the confirmed selection. The v1 route remains available with its own payload and interprets absence of selection as no shared measurement; the backend applies the same transaction and same idempotency rules. In case of concurrent requests between v1 and v2, revision control prevails. v1 responses do not receive new fields and continue to be validated by existing schemas. Reports and proposals will accept `VisionEvidenceRefSchema` only after I3 and an explicit compatible version.

For the MVP, summary with digest and version is retained, not original export nor images/video; define a retention period with data owners before use beyond demo. Non-shared data remains outside operational context. A share does not authorize transmission to external providers: such processing must be configured and made explicit in final integration.

## I0 closure criteria

Fixtures in `tests/agent/vision-contract.test.ts` document structure, missing values, synthetic origin, and sharing choices. Threshold and API version decisions are fixed and v2 sources are included in the main repository. Parameters are not clinical thresholds and synthetic evidence does not validate measurements on people.
