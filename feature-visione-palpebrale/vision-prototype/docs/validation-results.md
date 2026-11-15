# Measurement and Performance Validation — N05

Version: **N05 — preparation and connection**, updated 14 November 2026. The document collects the method, protocol, and verified synthetic results. **Quantitative validation with webcam and real people has not yet been performed**. T04/T05 are available; actual model loading in the browser and real annotated tests remain.

Manual tests without annotations are not presented as accuracy. Synthetic results verify the comparison method, not clinical behavior or measurement accuracy.

## 1 Purpose and Scope

N05 compares:

- manually annotated closure events with bilateral closures from the engine;
- coverage, valid time, and closure share read from `EngineSnapshot`;
- processed frame frequency and inference latency.

Not included in N05: diagnosis, fatigue percentages, suitability, and clinical accuracy. T04 provides the webcam session; T06 performs application and offline testing.

## 2 How the Comparison Works

The code is in `src/validation/`:

| Function | Purpose |
| --- | --- |
| `matchClosureEvents` | One-to-one comparison between annotations and bilateral closures |
| `summarizeInferencePerformance` | Frequency, mean, min, max, p50, and p95 |
| `measureInference` | Single processing measurement with injectable clock |
| `createValidationReport` | Serializable JSON summary without recalculating the engine |

An event is a candidate if:

- intersection over union (IoU) is at least `minIou` (default `0.5`), or
- start and end fall within `startToleranceMs` / `endToleranceMs` (defaults `100 ms` each).

Matching is deterministic and one-to-one: highest IoU first, then smaller start/end errors. The report distinguishes true positives, false positives, missed events, completeness differences, and average start, end, and duration deviations.

Frequency is `(number_of_frames - 1) / total_interval`: it describes the processed frame step, not the camera's declared frame rate. Latency percentiles use linear interpolation.

## 3 Harness Usage

The webcam session automatically measures `processFrame` latency during measurement and stores samples in T05 JSON. The **Export N05 Report** button produces a performance report `n05-session-v1` with configurations, profiles, provenance, and device. Without annotations, `comparison` and `annotations` are `null`: no false positives or accuracy indicators are invented.

A consumer can call `createSessionValidationReport(exported, annotations)` passing real annotations to obtain the N05 comparison. An explicitly passed empty array instead indicates an annotated session without events.

```ts
import { createValidationReport } from '../validation';
import { measureInference } from '../validation/performance';

const measured = measureInference(
  () => adapter.processFrame(frame, signal),
  () => performance.now(),
);

const report = createValidationReport({
  annotations,
  snapshot,
  performanceSamples,
  matching: { minIou: 0.5, startToleranceMs: 100, endToleranceMs: 100 },
});
```

`annotations` contains intervals `{ id, startMs, endMs, complete?, source? }`. Matching thresholds must be set **before** looking at results and must not be changed to make an unfavorable case match.

## 4 Verified Synthetic Examples

These values come from tests in `tests/validation/` and verify only the calculation method:

| Synthetic Case | Outcome |
| --- | --- |
| Annotation 100–300 ms, event 100–300 ms | TP 1, precision 1, recall 1, errors 0 |
| Annotation 100–300 ms, event 400–500 ms | TP 0, FP 1, FN 1, precision 0, recall 0 |
| Annotation 100–300 ms, event 120–280 ms | IoU 0.8, start errors +20, end −20, duration −40 |
| Complete event expected, incomplete event produced | 1 completeness difference |
| 4 frames at 0/100/200/300 ms, latencies 10/20/30/40 ms | 10 fps, mean 25 ms, p95 38.5 ms |
| Synthetic session 100–300 ms closed | coverage 1, closedMs 200, quota 2/3 |

Commands:

```powershell
npm.cmd test -- tests/validation
```

## 5 Real Session Protocol

To be executed with T04/T05 available, webcam, and real model.

### 5.1 Environment to Record

| Entry | Value |
| --- | --- |
| Date and time | to be filled |
| Machine, CPU, and RAM | to be filled |
| GPU / delegate (`CPU` or `GPU`) | to be filled |
| Browser and version | to be filled |
| MediaPipe runtime and version | `@mediapipe/tasks-vision@1.2.3` |
| Model and SHA-256 | `face_landmarker/float16/1`, `64184e22…0bc9ff` |
| Webcam, resolution, and declared fps | to be filled |
| Lighting and position | to be filled |
| Engine/geometry/calibration `configId` | to be filled |
| Geometry `methodVersion` | `n03-ear-v1` |

### 5.2 Annotations

For each session:

1. record or review the video with timestamps consistent with those of the pump;
2. annotate start and end of each bilateral closure;
3. indicate `complete` when the eye reopens continuously;
4. classify source: `controlled`, `voluntary`, `spontaneous`, or `fixture`;
5. keep notes on glasses, reflections, rotations, out-of-frame, and interruptions.

Without annotations, the session is only qualitative and does not produce precision, recall, or duration error.

### 5.3 Minimum Conditions

| Test | What to Record |
| --- | --- |
| Base, frontal face, uniform light | annotated events, coverage, latencies |
| Glasses | reflections, false positives, missed events |
| Backlight or low light | face loss, coverage, invalidity |
| Head rotation | missing landmarks, start/end errors |
| Out-of-frame | invalidity, incomplete events, recovery |
| Short and prolonged voluntary closures | duration, completeness, prolonged |
| Blink | absence of bilateral closures |

For performance, collect at least one continuous 30-second interval and report `count`, `intervalMs`, `framesPerSecond`, `meanInferenceMs`, `p50InferenceMs`, `p95InferenceMs`.

## 6 Real Results

Status: **not yet performed**.

| Test | Precision | Recall | Mean Errors | Coverage | p50 / p95 Inference |
| --- | --- | --- | --- | --- | --- |
| Base frontal | — | — | — | — | — |
| Glasses | — | — | — | — | — |
| Low light / backlight | — | — | — | — | — |
| Rotation | — | — | — | — | — |
| Out-of-frame | — | — | — | — | — |

Cells must be filled only with annotated sessions and with configuration, machine, and version recorded. Partial results must be labeled as such.

## 7 Limitations

- Synthetic measurements verify the code, not accuracy on people.
- Manual annotations may be imprecise and must be preserved.
- The model, glasses, reflections, pose, and lighting influence landmarks; N05 measures these effects, it does not eliminate them.
- Latency depends on browser, hardware, delegate, and resolution.
- Measurements describe observed eyelid behavior: they are not diagnosis, fatigue percentages, or suitability judgments.
- Definitive quantitative validation requires annotated tests with local assets loaded and a protocol agreed with the other developer.
