# I1 — Eyelid import and persistence

Import uses a local snapshot of the pure prototype modules in `server/agent/vision/vendor`; `SHA256SUMS.txt` records their contents. The 20 TypeScript sources match the originating C01 v2 revision `9803a5f41eff521db5d1305af82323da11332eb5`, now included directly in `feature-visione-palpebrale/`; comparison normalizes Windows/Unix line endings. It is an explicit, versioned copy in the agent repository. Do not modify the two engines separately without updating tests, hashes, and worker.

`validator-worker.cjs` is generated from the vendor sources via `npm run build:vision-worker` with esbuild 0.28.2. The worker is launched by `server/agent/vision/validate-export.ts`, isolating parsing and replay with a 5-second limit. The Next process must start from the project root and the distribution must include the worker file. Validation verifies consistency, it does not authenticate that a file actually comes from a webcam.

For a new checkout: `npm ci`, `npm run db:generate`, `npm run db:push`, then `npm run dev`. Schema update I1 adds three tables and indexes; it does not delete existing table contents. Verify your database and migration procedures before use in a shared environment.

All routes require a valid astronaut identity and check session ownership:

1. `POST /api/agent/v1/sessions/{id}/vision-observations` with `Authorization: Bearer ...`, `Idempotency-Key: ...`, `Content-Type: application/json` and the v2 export file as body. Limit 10 MiB; the result is a `data` summary conforming to `VisionObservationSchema`. A reused key with different bytes produces `409`.
2. `GET /api/agent/v1/sessions/{id}/vision-observations` returns up to 100 summaries, ordered from most recent; it does not return the raw file.
3. `PUT /api/agent/v1/sessions/{id}/vision-selection` with `{ "visionObservationId": "..." }` explicitly selects a session measurement; `null` clears the selection. The selection feeds the conversation context.
4. `POST /api/agent/v2/check-ins/{id}/confirm` with `{ "expectedRevision": 1, "sharedObservationIds": [], "vision": { "visionObservationId": "...", "shareWithGround": true } }`. The ID must match the current selection; use `null` and `false` to confirm without measurement. The `202` response contains `data.checkIn`, `data.vision` and `meta.contractVersion` 2.0.0.

v1 confirmation remains available and represents a confirmation without shared measurement. Confirmation atomically saves the revision, selection, sensors, and any shared summary. Identical retries reuse the snapshot; changes to selection or revision are rejected. Check-ins confirmed before I1 and without snapshot are treated as `LEGACY_UNAVAILABLE`: context is not reconstructed from current sensors and a new check-in is required for a new generation. Already generated artifacts remain consultable.

The operational report uses the sensors and authorized measurement frozen, according to the [I3 guide](i3-vision-report.md). Runtime proposal generation remains subject to the authoritative program. The import page and direct webcam submission are I4 and I5 respectively.
