# I3 — Vision in operational report

Generation uses the frozen snapshot at confirmation. If the measurement has not been shared, `vision` is `null` and the operational AI receives no eyelid data. The diary remains separate. The shared measurement is projected into only the fields useful for analysis, without digest, calibration ID, or raw content.

A `USABLE` webcam measurement can be cited as `{ "source": "vision", "visionObservationId": "..." }` in a finding or in a proposal's evidence. The server accepts only the ID present in the authorized snapshot; invented, private, synthetic, or insufficient references are rejected. An inference combining sources uses `source: "inference"` and cites each evidence. Vision describes the eye measurement: it does not prove sleep hours, fatigue, or a diagnosis.

Shared synthetic or insufficient observations may be described as uncertainties, but they do not constitute usable evidence for conclusions or proposals. The server adds deterministic information to the report on origin, status, interval, valid time, coverage, and limitations, even if the AI omits it. The simulated provider also generates a finding for a usable webcam; Nemotron receives the same limitations in the instructions.

Reports with references of type `vision` require `GET /api/agent/v2/reports?astronautId=...`; the response uses `meta.contractVersion: "2.0.0"`. The v1 route returns `409 INVALID_STATE` if the requested page contains vision references, avoiding sending a new structure to old clients. Previous reports without vision remain readable in v1. Authentication and astronaut scope checks are identical for v1 and v2.

The proposal validator recognizes the same shared and usable evidence. Generation is now enabled in the demo runtime with persistent and versioned program: a proposal remains pending Terra's decision, may use the webcam as additional evidence, and must include shared statements on rest or fatigue. v2 APIs expose proposals, decisions, and program. Constraints, scenarios, and integration are described in [Report and schedule](./report-and-schedule.md).

Check-ins already confirmed before the introduction of snapshots remain consultable, but a new generation requires a new check-in if the frozen context is not available. Integration tests use fixtures and temporary databases; validation on real webcams and people remains a separate task.
