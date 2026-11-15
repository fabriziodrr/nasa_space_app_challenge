# Agent and data backend integration contract — proposed version 1

This document fixes the decisions for integration with Emanuel's Python backend and the dashboard. It is a contract for the next implementation: current endpoints and schemas are not yet all compliant. Existing demo APIs are described in [DATA_BACKEND.md](../DATA_BACKEND.md).

## Identity and provenance

- The agent's `astronautId` and Python's `subject_id` identify the same person through an explicit mapping configured by the server and authorized. The model and the browser do not decide the mapping. In demo only, `astro-1 → sleep-demo-14d` can be configured explicitly, marked `demo_only_unverified`: data does not thereby become a verified personal history.
- Identity, synthetic mode, and authorized scope are fixed by the server for each request. The current Python backend is for local trusted use and does not guarantee multi-user authentication: before use with personal data or access from Earth, effective authentication and authorization are required.
- Every datum retains original ID, source, `observed_at` UTC, quality, and `synthetic` indication. Missing, invalid, future, or out-of-window data remain distinct: do not replace them with zero or simulated values. Synthetic data remains labeled as such.

## Check-in and scales

| Agent field | Common contract | Origin |
| --- | --- | --- |
| `SLEEP_HOURS` | Number 0–24, declared hours | `self_report` |
| `SLEEP_QUALITY` | Integer 1–10: 1 very poor, 10 very good | `self_report` |
| `FATIGUE` | **Integer 1–10: 1 minimum, 10 maximum reported fatigue** | `self_report` |
| `PHYSICAL_NOTES` | Text reported by the astronaut | `self_report` |

Python's `fatigue_rating` and agent's `FATIGUE` use 1–10 without transformations. Sleep quality and mood are also on 1–10. `alertness` is a distinct measure and is not converted into fatigue. An ambiguous sentence does not become an invented number. Python feedback constitutes a confirmed statement only if `basis=self_report`, `user_confirmed=true`, and `quality=valid`; model inference is not a statement by the person.

New agent observations include `scaleMax: 10`; previous ones without metadata are read with `scaleMax: null` and remain of unspecified scale. Value corrections require `scaleMax: 10`. The Python backend requires `scale_max: 10` for new sleep quality and mood self-assessments and `mood_scale_max: 10` for mood in feedback; previous records without metadata are returned with null scale. API users must update clients and validations: this change introduces new fields and ranges in existing contracts. Historical data is not converted. The demo rule for new observations uses fatigue at least 8/10 and applies no thresholds to unknown scales: it is an illustrative choice, not a clinical criterion.

## Backend reading and adaptation

The demo runtime uses `PythonSensorProvider` to read `GET /v1/subjects/{subject_id}/agent-context?synthetic=true` on the local backend `127.0.0.1:8000`, without reading the Python database directly. The default server mapping is `astro-1 → sleep-demo-14d` and remains **unverified**. `AGENT_DATA_SUBJECT_ID` allows changing the synthetic demo subject; only `astro-1` is enabled. The context exposes `snapshot_id`, `as_of`, `truncated`, and `sleep_context`; the backend does not expose an immutable snapshot history.

| Python datum | Agent datum | Rule |
| --- | --- | --- |
| `sleep_context.latest_measurement.sleep_hours` | `SLEEP_DURATION`, unit `h` | Only measure `quality=valid`, with ID, source, period, timestamp, and synthetic flag preserved. |
| `sleep_context.latest_measurement.awakenings_count` | `SLEEP_INTERRUPTION_COUNT`, unit `count` | Only if present and valid; do not invent the number of awakenings. |
| Heart rate | `RESTING_HEART_RATE`, `bpm` | The current Python context does not provide it: absent, without using a demo value as if it came from the backend. |
| `latest_confirmed_feedback.fatigue_rating` | Historical feedback 1–10 | Source distinct from the current check-in declaration; do not automatically add it to shared observations. |

Readings preserve `provenance` metadata, including period, method, demo subject, snapshot ID, and status. Available measures are `DEGRADED` because identity is not verified; the report presents them separately and they cannot motivate proposals or deductions attributing them to the astronaut. The unavailable sensor has value `null` and an explicit reason (`MISSING`, `STALE`, `INVALID`, `UNAVAILABLE`). The measure is usable only if the end of the period falls within the 24 hours preceding and `observed_at` is not future relative to the request: `as_of` does not prove that the datum is recent. If `truncated=true`, the limit is visible in the report. Timeout, error response, or unavailable service do not trigger silent fallbacks to fictitious readings.

For backend-independent proofs set `AGENT_SENSOR_PROVIDER=mock` and restart Next; the default is `python`. For the backend, start the Python service as in [DATA_BACKEND.md](../DATA_BACKEND.md) and load synthetic data. Historical examples may result `STALE`: they are not presented as current measures. Additional metadata on readings extends the existing contract and requires clients with strict validation to be updated.

At check-in confirmation, the agent acquires the authorized context once and freezes values and metadata, Python snapshot ID, acquisition time, shared webcam measure, and schedule version. Generation and retry use that frozen context; the Python snapshot ID identifies the result but does not guarantee its historical retrieval. The webcam measure selected for the conversation is shareable with Earth only with distinct consent at confirmation; selected does not mean automatically shared.

## Reports and schedule

The deterministic Python report describes available sources. The agent's operational report for Earth uses only the frozen and authorized context, preserves evidence, and distinguishes statements, sensors, vision, and inferences. Synthetic or insufficient vision is not operational evidence; vision alone does not determine sleep, fatigue, or diagnosis. The diary remains private.

The versioned schedule in Prisma is the shared authority **of the demo**: the agent uses it directly and the dashboard can read or update it using v2 APIs and authorized credentials. Earth can replace it with atomic version control, or approve a proposal with durable deduplication. No schedule endpoint is present in the current Python backend; program ownership beyond the demo remains to be agreed with the team. Only `APPLIED` means proposal applied; a rejection or an obsolete proposal does not modify the program. Dashboard view selection does not replace Earth authorization.

## Implementation sequence and verification

1. Update clients to scales 1–10 and scale metadata; preserve historical unidentifiable readings without converting them.
2. Define executable Python/TypeScript adapter schema and server configuration of demo mapping, keeping identity unverified explicit.
3. Implement reading provider, freeze context, and test missing, invalid, old, synthetic, out-of-scope, and unreachable backend data.
4. Generate report and proposal using frozen and authorized sources; verify separation between private and shared and behavior without sufficient data.
5. Integrate dashboard with report, proposal, and Earth decision; define and connect the shared schedule provider before declaring synchronization complete.
6. Test voice, webcam, backend, report, decision, and schedule update. The current demo can be tested separately without assuming that synthetic data represents the same real person.
