# Export and integration — T05

The UI offers **Export JSON webcam** during or after a measurement and **Export JSON synthetic** during or after a replay. The download is local. The exported result is the snapshot shown at the time of the click, even if inference has already processed other frames not yet displayed. A webcam interruption preserves the profile needed to export the last displayed measurement.

## Schema `crewready-session-v2`

Revision v2 adds multiple profiles with configuration for identifier, application state, webcam context, and performance samples. It is distinct from v1; files already exported in v1 remain unchanged, but the v2 validator rejects them.

| Field | Content |
| --- | --- |
| `schemaVersion`, `contractVersion` | Package and contract versions |
| `exportedAt` | UTC export date, ISO 8601 |
| `source` | `webcam` with device, resolution, and limits, or `synthetic` with fixture name, version, and fingerprint |
| `units` | Time in milliseconds, normalized aperture, values between 0 and 1 |
| `clock`, `timeOriginUnixMs` | Monotonic clock and its Unix origin for webcam; virtual time and `null` for fixtures |
| `calibration` | Profiles and effective configurations per identifier for webcam; synthetic identifiers and reason for absence of physical profiles for replay |
| `inference` | Geometric configuration, model, runtime, provenance, and checksum; `null` for synthetic replays |
| `snapshot` | Complete engine snapshot, with configuration, session, window, events, versions, and diagnostics |
| `samples` | Samples in the order offered to the engine, including any rejected ones and invalidity reasons |
| `performanceSamples` | Timestamp and inference latency for frames processed during the webcam measurement |
| `application` | Phase, interruption, and any application error; `null` for replay |
| `unavailable` | Explicit reasons for unavailable values: no interval, no valid time, or no complete event |

The absence of a value remains `null`, distinct from a measured zero. The `closureFraction` quota is the experimental time quota calculated by N02. UI and consumer do not recalculate durations or fractions. Ongoing and incomplete events retain the original engine fields.

Synthetic samples are already normalized: calibration identifiers are preserved, but they do not represent physical profiles. The export does not include images or video. MediaPipe configuration also includes local asset paths; provenance preserves model version and SHA-256. Device identifier and name are included if available. The fixture's 32-bit FNV-1a fingerprint identifies accidental content variations, it is not a security signature.

## Separate consumer

`src/integration/session-export.ts` does not import React or UI global variables. `createSessionExport` receives the result and its metadata, checks that webcam profiles are resolvable, and creates an independent JSON object. The export timestamp is provided by the caller. `summarizeExport` is an example consumer that reads engine values directly:

```ts
import { summarizeExport } from '../src/integration/session-export';
import { parseSessionExport } from '../src/integration/parse-session-export';

// `jsonText` contiene un pacchetto prodotto da questa versione dell'app.
const data = parseSessionExport(jsonText);
const summary = summarizeExport(data);
console.log(summary.coverage, summary.closureFraction, summary.validMs);
```

`parseSessionExport` validates version, structure, metadata, profiles, limits, and samples, then re-runs the engine and rejects an inconsistent snapshot. It accepts up to 50 million characters and 18,000 samples; it supports only C01 v2 / session v2. Verification is synchronous and does not authenticate file provenance. `serializeSessionExport` rejects non-finite numbers and non-serializable values instead of silently converting them to `null`.

To reproduce the result, create `TemporalEngine` with `snapshot.config`, call `start()`, offer `samples` in the saved order, and call `stop()` only if `snapshot.status` is `stopped`. Exporting a partial replay preserves only the samples already processed in the displayed snapshot. No raw frames or geometries are preserved: the file reproduces the temporal engine from calibrated samples, not the entire MediaPipe inference from video.

## Verification

`npm.cmd test` includes `src/integration/session-export.test.ts`: JSON round trip and replay of all fixtures, partial replays with rejected samples, unavailable results, webcam profile, provenance, rejection of missing profiles and non-serializable values. `src/app/live-session.test.ts` verifies that the profile remains exportable after stop. Manual download testing is the user's responsibility.

## Performance and limits

The measurement automatically stops at 18,000 samples; all remain exportable. The chart is limited to 2,000 points and reports when it is simplified. The JSON can still be large: it contains the entire snapshot, all samples, and latencies. `createSessionValidationReport` produces `n05-session-v1` with context and statistics; the comparison remains `null` until annotations are provided.
