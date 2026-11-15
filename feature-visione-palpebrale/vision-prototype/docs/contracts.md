# Shared Contracts and Temporal Semantics

Current contract: **c01-v2**, November 14, 2026, revision of c01-v1. The revision adds `sample_limit`, `unstable_reference` and reason details; N02, N03, N04, the UI and export are updated together. C01 v1 was established on November 13, 2026 based on proposal N01/N02.
`src/contracts/version.ts` exposes `CONTRACT_VERSION`. Formats already produced by N02 retain `n02-snapshot-v1`, `n02-engine-v1` and `n02-fixture-v1`: C01 does not rename their fields. Subsequent incompatible changes require a new version and explicit update of producers, consumers and fixtures.

The temporal engine is pure TypeScript: it does not import DOM, React, webcam, network or inference runtime. It receives `AnalysisSample` and produces `EngineSnapshot`. Reference code is in `src/contracts/` and `src/analysis/`.

## 1 Units, values and `null`

| Concept | Unit / range | Meaning |
| --- | --- | --- |
| Time | milliseconds, finite number | Same origin for all samples in a session; must be monotonic |
| `openness` | finite number, normally 0–1 | 0 = closed reference, 1 = open reference; the engine does not clamp out-of-range values |
| Thresholds | 0–1 | `closedEnter` < `openExit`; the intermediate band is the hysteresis band |
| Durations | milliseconds | Sums of intervals between accepted samples |
| Coverages and ratios | number or `null` | `null` when the denominator is zero |
| Reasons and states | enumerable strings | Codes are stable; the UI may translate them into messages |
| Ongoing events | `endedAtMs: null` | Observed duration extends to the last sample, not to the call instant |

An unevaluable eye has no number: `openness` is not `0`, because `0` means continuously closed, not missing data. Similarly, a coverage of `0` indicates observed time without valid data, while `null` indicates that there is no time interval yet on which to calculate it.

## 2 Input frame to inference

`src/contracts/frame.ts` defines `InferenceFrame`:

- `frameId` positive increasing integer per acquisition instance, `timestampMs` finite and non-negative, `width` and `height` positive integers;
- `pixels` in `rgba8` format, sRGB, top-to-bottom rows, contiguous R/G/B/A channels, four bytes per pixel and no padding. `data` is a `Uint8ClampedArray<ArrayBuffer>` of exactly `width * height * 4` elements, with zero offset and dedicated buffer, no aliasing with subsequent images;
- `source` distinguishes `webcam` and `synthetic`;
- `release()` is the consumer's responsibility, who calls it exactly once even on error;
- the producer keeps the buffer valid until the `release()` call;
- after `release()` pixels are neither read nor transferred; release is idempotent to protect error paths;
- `timestampMs` is monotonic and in milliseconds: for the webcam it is the callback time, relative to `performance.timeOrigin`, not the sensor instant.

`Uint8ClampedArray` and `ArrayBuffer` are available both in the page and in a Web Worker. The contract therefore allows transferring `pixels.data.buffer`, but does not impose the Worker and is not imported by the temporal engine.

The consumer uses `InferenceFrameConsumer(frame, signal)` and terminates its Promise only after finishing using the pixels. It must release them in a `finally` and ignore results if the signal is cancelled. One processing at a time, no queue and no reconstruction of skipped frames, even across stop and restart. Stop cancels work but does not free buffers still in use: the consumer must conclude or handle cancellation.

The webcam uses `src/capture/inference-frame-adapter.ts`: copies the original video into a local canvas before the first `await`, produces RGBA and guarantees cleanup even for fallible consumers. The CSS mirror is not applied to pixels. The canvas is created only if a consumer is connected: preview alone does not copy images. The `CapturedVideoFrame` structure remains an internal detail.

For a Worker, only metadata and `pixels.data.buffer` are transferred, not `release`, `signal` or the whole object with functions. The main adapter propagates cancellation, awaits end-of-processing confirmation and calls `release()`. The Worker returns the same `timestampMs` received, without using its own clock. The initial N04 path runs in the page; the Worker is optional and the compatible path is documented in `docs/inference.md`.

The N04 adapter consumes this `InferenceFrame` RGBA and produces `FaceInferenceResult` with state `face`, `no_face`, `ambiguous` or `invalid_landmarks`. The result always contains `FaceGeometryObservation`; an absent face does not become open eyes. Configuration, loading, frame or runtime errors are explicit via `InferenceError.code`. Details and provenance in `docs/inference.md`.

## 3 Sample for the engine

`src/contracts/sample.ts` defines `AnalysisSample`:

```ts
interface AnalysisSample {
  timestampMs: number;
  calibrationId: string;
  left: EyeObservation;
  right: EyeObservation;
}

type EyeObservation =
  | { validity: 'valid'; openness: number }
  | { validity: 'invalid'; reasons: readonly [EyeInvalidityReason, ...EyeInvalidityReason[]] };
```

Rules:

- `timestampMs` finite and non-negative; the engine rejects duplicates and decreasing values;
- `calibrationId` non-empty string not composed only of spaces;
- `openness` finite and already normalized with the indicated calibration;
- an `invalid` eye must have one or more reasons, but no `openness`, not even zero. The engine also rejects runtime-detected violations.

Reasons shared from `EYE_INVALIDITY_REASONS`: `not_tracked`, `landmark_missing`, `low_confidence`, `geometry_invalid`, `out_of_range`, `ambiguous_face`, `uncalibrated`, `unknown`. `ambiguous_face` indicates multiple faces and is accepted by the engine as an unevaluable observation.

Raw geometry before calibration is described in `src/contracts/geometry.ts`:

- `FaceLandmarks` contains the six points per eye, image dimensions and coordinate space (`normalized` or `pixels`);
- `EyeGeometryObservation` exposes `eyeAspectRatio`, horizontal width in pixels, validity and reasons;
- `FaceGeometryObservation` retains timestamp, `methodVersion` and the two eyes.

The formula is EAR, calculated in pixels after conversion of normalized coordinates. Points, scale correction and admissibility checks are described in `docs/measurement-method.md`; the temporal engine reads only `openness`.

For valid geometry `eyeAspectRatio` is a finite non-negative number, dimensionless, without a universal maximum. The N03 formula must correct scales using actual image dimensions before distance ratios. The point set and geometric checks are documented by N03; `methodVersion` identifies the method, while configuration retains its thresholds. No conversion is invented in the UI. Invalid geometry uses `valid: false`, at least one reason and no `eyeAspectRatio`.

`left` and `right` indicate the sides of the person filmed, regardless of preview mirroring. Producers do not modify or reuse samples after delivery to the engine. To display invalidity reasons, the UI retains the last accepted sample in `ApplicationSessionSnapshot.lastSample`; aggregates and eye states always come from `EngineSnapshot`.

## 4 Calibration

`src/contracts/calibration.ts` defines:

- `CalibrationConfigValues`: required samples per eye and phase, maximum deviation from median and minimum separation;
- `CalibrationProgress`: technical state, active phase and progress per eye;
- `CalibrationOutcome`: outcome per eye, detailed reasons, profile or `null`;
- `CalibrationState`: C01 application state derived with `toCalibrationState`;
- `CalibrationProfile` and `EyeCalibrationReferences`.

In the profile:

- `id` distinguishes a specific set of references;
- `version` identifies formula and procedure;
- `methodVersion` must match the geometry used for samples;
- `open`, `closed` and `minimumSeparation` are in N03 raw geometry;
- `normalization: 'open-closed-v1'` describes the normalization used to produce `openness`.

References must be finite, non-negative, with `open > closed`, `minimumSeparation > 0` and `open - closed >= minimumSeparation`, for both eyes. Normalization is `(value - closed) / (open - closed)`, without clipping. `capturedAtMs` is a UTC date in Unix milliseconds: it is metadata and does not enter time calculations. Before a valid calibration, webcam measurement does not start.

`CalibrationState` defines `idle`, `collecting`, `ready` and `insufficient`. During collection, `reference` distinguishes `open` and `closed`; `acceptedSamples` counts the two eyes separately in the current reference and `requiredSamplesPerEye` declares the positive integer target. N03 chooses and records the experimental number and collection algorithm; only geometrically valid data increment the counters. Application failure reasons are `insufficient_samples`, `insufficient_separation`, `invalid_geometry`, `unstable_reference` and `interrupted`.

N03 also retains detailed reasons `CalibrationEyeFailureReason`: `not_enough_open_samples`, `not_enough_closed_samples`, `unstable_open`, `unstable_closed`, `separation_too_small`. `toCalibrationState(progress, outcome)` translates insufficient samples into `insufficient_samples`, reduced separation into `insufficient_separation` and unstable references into `unstable_reference`. Original N03 reasons are retained in `details`; `interrupted` distinguishes an interrupted collection from insufficient data. Technical state `ready` indicates only that collection is sufficient: C01 state becomes `ready` only after successful `finish()`, with a complete profile. The profile retains the method actually collected; mixing methods or using a profile on a different method produces `CalibrationStateError` and requires a new calibration.

A new webcam start, source change, method/model, resolution, cropping or normalization procedure, suspension or acquisition error invalidates references for subsequent measurements. A new calibration is required. A tracking loss or gap within the same acquisition interrupts events, without automatically invalidating references if the context is unchanged. The UI never presents an old calibration as automatically valid.

The engine does not recalculate calibration: it uses `calibrationId` only to verify continuity. An identifier change interrupts measurement and closes ongoing episodes as incomplete. The procedure is in `docs/calibration.md`.

## 5 Engine API

`TemporalEngine` in `src/analysis/engine.ts`:

```ts
new TemporalEngine(config?)
start(): void
processSample(sample: AnalysisSample): ProcessSampleResult
getSnapshot(): EngineSnapshot
stop(): void
reset(): void
```

- `start()` resets the session and sets state to `running`;
- `processSample()` is valid only in `running`; otherwise it throws `EngineStateError`, which signals a usage error, not a rejected sample;
- a malformed or non-monotonic sample returns `{ status: 'rejected', reason, message }` and does not modify the measurement;
- `getSnapshot()` is immutable and has no side effects;
- `stop()` closes open episodes as incomplete with reason `stopped` and does not extend duration until the call instant;
- `reset()` returns to `idle` and clears all results.

A rejected sample updates only diagnostics and rejection counters; it does not modify measures or the last accepted sample. The UI and export consume the same snapshot, without duplicating metric calculation.

Rejection reasons: `invalid_timestamp`, `duplicate_timestamp`, `out_of_order_timestamp`, `invalid_calibration_id`, `invalid_eye_observation`.

## 6 Per-eye hysteresis

For each eye the engine maintains state `unknown`, `open` or `closed`.

- from `open` or `unknown`: becomes `closed` if `openness <= closedEnter`;
- from `closed`: returns to `open` if `openness >= openExit`;
- in the intermediate band the previous state remains unchanged.

A valid sample always brings the eye to `open` or `closed`. An invalid sample brings the eye to `unknown` and closes any ongoing episode as incomplete.

Bilateral state is:

| State | Condition |
| --- | --- |
| `closed` | both eyes evaluable and closed |
| `open` | both eyes evaluable and open |
| `mixed` | both evaluable, one open and one closed: wink |
| `unknown` | at least one eye not evaluable |

Only `closed` generates a bilateral episode. `mixed` is not a bilateral closure.

## 7 Time attribution

The policy is **sample-and-hold**: the state computed on a sample applies to the interval until the next sample, i.e. `[t_i, t_{i+1})`.

- The last sample adds no duration beyond itself.
- An interval `<= maxGapMs` between two accepted samples enters observed time.
- An interval `> maxGapMs` is a **gap**: it enters neither valid time nor closed time, interrupts continuity and closes open episodes as incomplete with reason `gap`.
- A change of `calibrationId` makes the interval a calibration transition: it does not enter valid time, interrupts continuity and closes episodes with reason `calibration_changed`.
- An invalid sample does not contribute to the following interval; the previous interval remains attributed to the last valid state. The ongoing episode is closed at the instant of the invalid sample with reason `tracking_lost`.
- Duplicates and out-of-order timestamps are rejected without modifying state, durations or counters.

No missing time is reconstructed as certain closure. Gaps and calibration transitions remain visible in `gapMs` and `calibrationTransitionMs` and are included in `unknownMs = elapsedMs - validMs`.

## 8 Events

An episode is recorded separately for left eye, right eye and bilateral pair. Each event has:

- `id` deterministic in format `left-N`, `right-N`, `bilateral-N`;
- `startedAtMs`, `endedAtMs`, `durationMs`;
- `complete` and `endedReason`;
- `prolonged`, true only for complete events with duration at least `prolongedClosureMs`.

End causes:

| `endedReason` | Complete event | Meaning |
| --- | --- | --- |
| `reopened` | yes | The eye or pair reopened continuously |
| `tracking_lost` | no | An eye is no longer evaluable |
| `gap` | no | The interval exceeds `maxGapMs` |
| `calibration_changed` | no | Calibration changed |
| `stopped` | no | The session was stopped while the event was open |
| `null` | no | The event is still ongoing in the snapshot |

Ongoing events appear in the list with `endedAtMs: null` and observed duration up to the last sample.

## 9 Metrics

For each perimeter (session, rolling window, left eye, right eye) the engine exposes:

- `elapsedMs`: interval from start to end of the perimeter, including gaps and transitions;
- `validMs`: time with usable data; for the bilateral perimeter it requires both eyes evaluable;
- `closedMs`: part of `validMs` with eye or pair in state `closed`;
- `openMs = validMs - closedMs`;
- `unknownMs = elapsedMs - validMs`;
- `coverage = validMs / elapsedMs`, `null` if `elapsedMs` is zero;
- `closureFraction = closedMs / validMs`, `null` if `validMs` is zero;
- `gapMs`, `calibrationTransitionMs` and episode statistics.

`closureFraction` retains the experimental closure ratio name: it is not a fatigue or suitability percentage.

Episode statistics:

- `episodeCount`: events overlapping the perimeter; in the session all events, in the window also those cut by the edge;
- `completeCount` / `incompleteCount`: in the window, `completeCount` requires the event complete and entirely contained, so a cut event is incomplete in the perimeter;
- `prolongedCount`: only complete events with duration at least `prolongedClosureMs`;
- `longestCompleteMs`: maximum complete closure, `null` if none;
- `longestObservedMs`: maximum observed duration, including incomplete events.

## 10 Session and rolling window

The session covers from start to end of the observed period.

The rolling window covers `[max(start, end - rollingWindowMs), end]`. Times are calculated by cropping the same intervals as the session, without reconstructing states. For events:

- `durationMs` remains the actual event duration;
- `windowOverlapMs` is the part inside the window;
- `completeWithinWindow` is true only if the event is complete and entirely contained in the window;
- `truncatedAtStart` and `truncatedAtEnd` signal the cuts.

A closure crossing the edge is therefore not presented as a shorter complete event: in the window aggregate it counts as incomplete and does not contribute to `longestCompleteMs` nor to `prolongedCount`.

## 11 Configuration

Initial engine values in `src/analysis/config.ts`, all experimental:

| Parameter | Initial value | Constraint |
| --- | --- | --- |
| `closedEnter` | 0.25 | `0 <= value < 1` |
| `openExit` | 0.4 | `closedEnter < value <= 1` |
| `maxGapMs` | 250 | `> 0` |
| `rollingWindowMs` | 10000 | `> 0` |
| `prolongedClosureMs` | 500 | `> 0` |
| `version` | `n02-config-v1` | non-empty string |

All numbers must be finite. Time parameters are strictly positive milliseconds, also fractional. An omitted version uses the default; an explicitly empty or whitespace-only version is rejected.

`configId` combines version and effective values, e.g. `n02-config-v1|closedEnter=0.25|...`. Consumers must retain it together with results. Configuration is not modified during a session.

Initial geometry values in `src/analysis/geometry.ts`:

| Parameter | Initial value | Constraint |
| --- | --- | --- |
| `minEyeWidthPx` | 8 | `> 0` |
| `maxEyeAspectRatio` | 1.2 | `> 0` |
| `coordinateTolerancePx` | 1 | `>= 0` |

Initial calibration values in `src/analysis/calibration.ts`:

| Parameter | Initial value | Constraint |
| --- | --- | --- |
| `requiredSamplesPerEye` | 8 | integer `>= 2` |
| `maxReferenceDeviation` | 0.05 | `>= 0` |
| `minimumSeparation` | 0.05 | `> 0` |

Geometry and calibration also expose a `configId` with the values used. The three identifiers must be retained with session and export.

N04 adapter configuration:

| Parameter | Initial value | Constraint |
| --- | --- | --- |
| `modelAssetPath` | from `runtimeAssets` | local path, mandatory |
| `wasmAssetPath` | from `runtimeAssets` | local directory, mandatory |
| `delegate` | `CPU` | `CPU` or `GPU` |
| `numFaces` | 2 | integer 1–4 |
| `minFaceDetectionConfidence` | 0.5 | 0–1 |
| `minFacePresenceConfidence` | 0.5 | 0–1 |
| `minTrackingConfidence` | 0.5 | 0–1 |

`numFaces: 2` allows recognizing multiple faces as an ambiguous observation. The adapter `configId` combines delegate, number of faces and geometry configuration. Runtime version, model checksum and licenses are in `docs/inference.md`.

## 12 Fixtures and replay

`fixtures/` contains typed sequences and `src/analysis/replay.ts` offers `replayFixture(fixture)`, which starts the engine, offers samples in declared order and returns the final snapshot. No webcam needed.

Each fixture declares configuration, samples, optional final stop and an expected snapshot subset. Cases cover: open eyes, short closures, prolonged closure, wink, tracking loss, gap, null valid time, duplicate or out-of-order timestamps, stop during closure, calibration change, hysteresis and rolling window with cut event. The list and expected results are in `fixtures/README.md`; tests are in `tests/analysis/`.

## 13 Application session

`src/contracts/session.ts` defines `ApplicationSessionSnapshot`. Webcam state remains distinct: an active preview does not imply an available measurement.

| `phase` | Meaning and transitions |
| --- | --- |
| `idle` | No activity; explicit source choice enables `loading` |
| `loading` | Webcam request, video or runtime preparation; success → `preview`, cancellation → `stopped`, error → `error` |
| `preview` | Source ready; user can start `calibrating` or stop |
| `calibrating` | Collects references; success → `preview` with ready profile, insufficient data → `preview` with reasons, interruption → `stopped`/`suspended`/`error` |
| `measuring` | Engine running; entry only on explicit command and with ready calibration, or with a declared synthetic fixture |
| `stopped` | Work finished and resources released; last result consultable, new explicit start for a new session |
| `suspended` | Hidden or frozen tab; acquisition stopped, no automatic resume |
| `error` | Pipeline stopped; message and error phase available, explicit retry |

`source` distinguishes webcam, synthetic data or no source. `engine` is `null` before the first measurement, then retains the snapshot even at stop; `interruption` and `error` fields explain stops and failures. `error` is set only in `error` phase; `lastSample` is `null` before accepted samples.

`LiveSnapshot` extends `ApplicationSessionSnapshot` directly: the webcam keeps its own states separate, while the UI uses `phase`, `calibration`, `lastSample`, `interruption` and `error` from the contract. Webcam request and start remain acquisition states; `loading` application phase indicates inference loading. Suspension, error and source change are distinct.

When source changes, tab is suspended or device is lost, the app stops engine and acquisition and retains the last summary. Ongoing events end with `stopped`; the distinct application cause is retained in `interruption`. The engine does not invent time beyond the last sample. After a new start, the engine restarts reset and the webcam requires a new calibration. A calibration change during the same measurement is handled by N02 with `calibration_changed`, excluding the transition interval.

For replay, original virtual timestamps of fixtures are retained: UI timers only change delivery time, without altering engine durations. Virtual clocks and webcam are not mixed in the same session.

## 14 Verifiable examples and retention decisions

`fixtures/contract-examples.ts` contains a synthetic profile, a valid sample, an invalid sample and `createContractExamples()`. The latter generates from the engine:

- a complete bilateral event of 200 ms, with cause `reopened`;
- an incomplete event of 100 ms, with cause `tracking_lost`;
- an unavailable result: `validMs = 0`, `coverage = 0`, `closureFraction = null`, no invented closure.

`tests/integration/contracts.test.ts` uses a JSON consumer separate from React and verifies version, configuration, calibration and invalidity reason consistency. Events also contain individual eyes: for bilateral counting `session.closures` is used, and for the list `kind === 'bilateral'` is filtered. The length of `session.events` is not the number of bilateral closures.

The engine retains events, intervals and rejections without silently discarding them. The live session stops explicitly at 18,000 samples, with reason `sample_limit`, retaining all samples for export. The chart retains at most 2,000 points and reports simplification; grouping conservatively marks intervals that include missing data. The engine produces the snapshot for the UI approximately every 200 ms and at stop, rather than at every sample. The limit circumscribes memory and cost, but does not replace N05/T06 testing.

N03 implements formula, points and collection procedure. N04 has fixed runtime, model, local assets and proposed indices; indices on the real model, CPU/GPU choice and parameter testing remain to be verified in N05. The function specification cited in the plan is still absent: this technical contract neither replaces nor attests a validation of the required measurements.

## 15 C01/N04 verification

On November 13, 2026, with Node.js 24.15.0 and npm 11.12.1, after N04 integration:

- `npm.cmd run build`: TypeScript check and build succeeded;
- `npm.cmd test`: **121 tests passed in 12 files**, including N02, webcam, RGBA adapter, shared contracts, geometry, calibration, synthetic replay, inference with mock runtime and N05 harness;
- `git diff --check`: no spacing errors or conflict markers.

As requested by the user, manual browser and webcam tests remain with the user. This table records the historical verification of November 13, not the current number of tests.

## 16 Subsequent N04/N05 verifications

MediaPipe indices on the real model, offline model and WASM loading, CPU/GPU, Web Worker path, long session cost and experimental values of thresholds, gap, window, minimum eye width, maximum EAR ratio, required samples, stability and reference separation remain to be verified. These tests do not reopen C01 decisions already fixed.
