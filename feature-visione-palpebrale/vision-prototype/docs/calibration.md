# Calibration Procedure — N03

Implementation **N03**, integrated with C01 v2. The logic is in
`src/analysis/calibration.ts`; the formula and geometric checks are in
[docs/measurement-method.md](measurement-method.md). The application screen is
linked from T04. It is not a clinical validation.

## 1 Preconditions

Before collecting references:

- the face is fully in frame and tracking is stable;
- sufficient lighting, without strong reflections on the eyes;
- the user removes or reports glasses that modify eyelid geometry;
- the webcam is started and sample timestamps are monotonic;
- the geometric and calibration configuration is the one that will be stored
  in the result.

Calibration does not correct head pose problems, occlusion, or model quality.
If the geometry is unreliable, references must be rejected instead of being
accepted as a measurement.

## 2 Guided sequence

1. **Preparation.** Show instructions and verify that both eyes are evaluable.
   The UI can use `getProgress()` to display counts.
2. **Open phase.** Call `beginPhase('open')`; the user looks forward and keeps
   their eyes open. For each valid geometric observation call
   `addSample(observation)`.
3. **Closed phase.** Call `beginPhase('closed')`; the user closes both eyes
   without squinting. Continue offering samples.
4. **Conclusion.** When both phases are complete, call
   `finish({ id, capturedAtMs })` with an identifier created by the
   application. Store the result and the returned profile.

The API does not use clock, DOM, or network. The UI creates identifier and
timestamp and decides when to advance, so replay and tests remain deterministic.

## 3 Collection and advancement

`CalibrationCollector` maintains samples separately per eye and phase. An
unevaluable eye is ignored: it does not produce a `0` value and does not
contribute to the median. Each eye collects at most the requested number of
samples per phase: if the other eye remains unevaluable, collection does not
grow without limit.

Initial configuration:

| Parameter | Value | Effect |
| --- | --- | --- |
| `requiredSamplesPerEye` | 8 | valid samples required per eye in each phase |
| `maxReferenceDeviation` | 0.05 | maximum deviation from the median |
| `minimumSeparation` | 0.05 | minimum difference open − closed |

`getProgress()` returns:

- `status`: `idle`, `collecting`, `ready`, `completed` or `failed`;
- `activePhase`: `open`, `closed` or `null`;
- `open` and `closed`: samples per eye, `requiredPerEye`, `complete` and
  `fraction` (0–1, limited to the minimum between the two eyes).

`fraction` is only for visual advancement. Calibration is complete when both
phases have enough valid samples for both eyes.

## 4 Outcome and failure reasons

`finish()` produces a `CalibrationOutcome` even when it fails. In case of
failure `profile` is `null`, but samples, medians, deviations, and reasons per
eye are available.

| Reason | Meaning | Suggested action for T04 |
| --- | --- | --- |
| `not_enough_open_samples` | fewer open samples than required for that eye | repeat the open phase with a more stable face |
| `not_enough_closed_samples` | fewer closed samples than required | repeat the closed phase, avoiding squinting |
| `unstable_open` | too much variability in the open phase | improve lighting or pose and repeat |
| `unstable_closed` | too much variability in the closed phase | repeat closure without movement |
| `separation_too_small` | open and closed are too similar | verify that eyes actually close and repeat |

The overall outcome succeeds only if both eyes have valid references. If only
one eye fails, the UI must show the reason for that side and not start a
bilateral measurement with an incomplete profile.

A successful calibration contains:

```ts
interface CalibrationProfile {
  id: string;
  version: string;
  methodVersion: string;
  capturedAtMs: number;
  normalization: 'open-closed-v1';
  eyes: {
    left: { open: number; closed: number; minimumSeparation: number };
    right: { open: number; closed: number; minimumSeparation: number };
  };
}
```

The profile must be stored with the session and with the export. The temporal
engine uses `id` to recognize a calibration change: measurement stops and
ongoing episodes become incomplete.

## 5 Usage example

```ts
import {
  CalibrationCollector,
  toAnalysisSample,
} from '../src/analysis/calibration';

const collector = new CalibrationCollector();
collector.start(); // fase aperto

// Per ogni FaceGeometryObservation prodotta da N04:
collector.addSample(openObservation);

collector.beginPhase('closed');
collector.addSample(closedObservation);

const outcome = collector.finish({
  id: `cal-${sessionId}`,
  capturedAtMs: Date.now(), // metadato UTC Unix, non il tempo monotono dei frame
});

if (outcome.success && outcome.profile !== null) {
  const sample = toAnalysisSample(geometryObservation, outcome.profile);
  engine.processSample(sample);
}
```

`start()` is a shortcut for `reset()` followed by `beginPhase('open')`.
`reset()` clears samples, progress, and outcome. After a completed outcome,
`beginPhase()` restarts with a new collection.

To link the outcome to C01 application state use
`toCalibrationState(collector.getProgress(), outcome)`. The technical `ready`
of the collector is not equivalent to a valid profile: a successful `finish()`
is required. Detailed N03 reasons are stored in the outcome and translated
into C01 application codes. `methodVersion` is collected from observations and
stored in the profile; a method change requires `reset()` and a new
calibration. The module rejects normalization of observations with a method
different from the profile.

## 6 Usage errors

`CalibrationStateError` is thrown if:

- `addSample()` is called without an active phase or after conclusion;
- `finish()` is called with empty `id` or invalid `capturedAtMs`;
- an unrecognized phase is passed.
- geometric methods are mixed during collection or normalization is attempted
  with a method different from the one stored in the profile.

These are UI programming errors, distinct from quality failures, which are
returned in `CalibrationOutcome.reasons`.

## 7 Data to store

To reproduce normalization the following are needed:

- complete `CalibrationProfile`;
- geometric configuration (`configId` and values);
- calibration configuration (`configId` and values);
- `methodVersion` of the geometry;
- collection timestamp and identifier.

## 8 Limits

- The procedure assumes square pixels and correctly associated MediaPipe points.
- It does not detect glasses, reflections, partial occlusion, or deviated gaze.
- Initial thresholds are experimental and must be verified in N05.
- A successful calibration attests to the geometric consistency of references,
  not the clinical accuracy of the measurement.
