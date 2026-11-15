# Measurement Method — N02/N03

Temporal method **N02**, confirmed in C01 v1, and geometry/calibration **N03**,
13 November 2026. The modules are in `src/analysis/geometry.ts` and
`src/analysis/calibration.ts`; experimental values will be verified in N05.
The document describes the eyelid formula, calibration, and transformation of
samples into durations and ratios. It is not a clinical validation.

## 1 Eyelid points and EAR formula

For each eye, six points are used, in the order of the Soukupová and Čech model:

| Name | Role |
| --- | --- |
| `p1` `outerCorner` | outer corner |
| `p2` `upperOuter` | upper outer point |
| `p3` `upperInner` | upper inner point |
| `p4` `innerCorner` | inner corner |
| `p5` `lowerInner` | lower inner point |
| `p6` `lowerOuter` | lower outer point |

The formula, calculated in pixels, is:

```text
EAR = (d(p2, p6) + d(p3, p5)) / (2 * d(p1, p4))
```

`EAR` is a non-negative dimensionless ratio. Under normal conditions the open
value is greater than the closed value; it is not interpreted as an opening
percentage or fatigue percentage.

Indices used by the N04 adapter for MediaPipe Face Mesh, to be verified again
on the real model in T04/N05:

| Person's eye | p1 | p2 | p3 | p4 | p5 | p6 |
| --- | --- | --- | --- | --- | --- | --- |
| right | 33 | 160 | 158 | 133 | 153 | 144 |
| left | 362 | 385 | 387 | 263 | 373 | 380 |

The mapping is exported in `MEDIAPIPE_FACE_MESH_EYELID_INDICES` and N03 does not
import MediaPipe.

## 2 Image scale correction

Points can arrive in pixels or in normalized coordinates. In the latter case:

```text
x_px = x_normalizzato * larghezza_immagine
y_px = y_normalizzato * altezza_immagine
```

All formula distances are calculated after this conversion. In this way a
non-square image or a different resolution does not alter the ratio. Square
pixels are assumed; anomalous device scales are not corrected by N03.

`methodVersion = n03-ear-v1` identifies points, formula, and scale correction.

## 3 Geometric admissibility

Before producing a valid ratio, `calculateEyeGeometry` checks:

| Check | Initial configuration | Reason if it fails |
| --- | --- | --- |
| Finite and positive image dimensions | mandatory | `geometry_invalid` |
| Finite and present points | mandatory | `landmark_missing` |
| Points inside the image | tolerance 1 px | `out_of_range` |
| Sufficient horizontal width | `minEyeWidthPx = 8` | `geometry_invalid` |
| Non-implausible ratio | `maxEyeAspectRatio = 1.2` | `geometry_invalid` |

Thresholds are in `DEFAULT_GEOMETRY_CONFIG` and can be redefined via
`resolveGeometryConfig`, which produces a `configId` with the used values. The
checks are only geometric plausibility: they do not automatically recognize
glasses, reflections, partial occlusion, gaze, head rotations, or landmarks
associated with the wrong eye. These limits must be verified in N05.

## 4 Calibration references

Calibration collects samples for each eye in two phases:

1. **open**: the user looks forward and keeps both eyes open;
2. **closed**: the user closes both eyes without squeezing them.

For each phase the engine stores valid EAR values and calculates the median per
eye. The median value reduces the effect of anomalous individual samples. An
unevaluable eye does not contribute to the median.

Initial configuration:

| Parameter | Value | Meaning |
| --- | --- | --- |
| `requiredSamplesPerEye` | 8 | minimum valid samples per eye and phase |
| `maxReferenceDeviation` | 0.05 | maximum deviation from the median |
| `minimumSeparation` | 0.05 | minimum difference between open and closed |

Calibration succeeds for an eye only if:

- there are enough valid samples in both phases;
- the maximum deviation from the median does not exceed `maxReferenceDeviation`;
- `median_open - median_closed >= minimumSeparation`.

The failure reasons exposed per eye are:
`not_enough_open_samples`, `not_enough_closed_samples`, `unstable_open`,
`unstable_closed`, `separation_too_small`. The overall outcome succeeds only if
both eyes succeed.

A successful calibration produces a `CalibrationProfile` with:

- `id` and `version`;
- `methodVersion` actually used in collection;
- `capturedAtMs`;
- `normalization: 'open-closed-v1'`;
- references `open`, `closed` and `minimumSeparation` per eye.

The operational procedure and messages for T04 are in
[docs/calibration.md](calibration.md). A change of `id` interrupts measurement
continuity in the temporal engine.

## 5 Normalized openness

For each eye and valid geometric sample:

```text
openness = (EAR - riferimento_chiuso) / (riferimento_aperto - riferimento_chiuso)
```

With normalization `open-closed-v1`:

- `openness = 0` corresponds to the closed reference;
- `openness = 1` corresponds to the open reference;
- values outside [0, 1] are admitted as noise and are not clipped by the
  engine;
- an unevaluable eye produces an `invalid` sample, not a numeric value.

The function `normalizeOpenness` requires a positive separation. The transition
from `FaceGeometryObservation` to `AnalysisSample` occurs with
`calibrateFaceGeometry` or `toAnalysisSample`.

## 6 States and hysteresis

For each eye:

```text
se stato = closed:   openness >= openExit   -> open, altrimenti resta closed
altrimenti:          openness <= closedEnter -> closed, altrimenti open
```

The band `closedEnter < openness < openExit` avoids oscillations around a
single threshold. An invalid sample puts the eye in `unknown`; it is not
equivalent to an open eye.

Bilateral closure requires both eyes evaluable and closed. A wink produces the
state `mixed` and does not increase bilateral closed time.

## 7 Interval attribution

The sample state applies to the interval until the next sample
(`sample-and-hold`). For two accepted samples at `t_i` and `t_{i+1}`:

```text
intervallo = t_{i+1} - t_i
```

If the interval exceeds `maxGapMs` it is a gap. Gaps and calibration changes do
not contribute to valid or closed time. An invalid sample invalidates the
following interval; the previous interval remains attributed to the last valid
state.

The last sample is not extended until the stop instant. An event still open at
`stop()` becomes incomplete and retains only the observed duration until the
last sample.

## 8 Valid time and coverage

For the bilateral pair:

```text
validMs = somma degli intervalli senza gap, senza cambio calibrazione,
          con entrambi gli occhi valutabili al campione di partenza

coverage = validMs / elapsedMs
```

`elapsedMs` includes gaps, calibration transitions, and intervals with missing
data. If `elapsedMs` is zero, `coverage` is `null`. If observed time is positive
but there are no valid data, `coverage` is `0`.

For individual eyes the same sum applies using only that eye's evaluability.
Bilateral valid time is not the average of the two eyes.

## 9 Closed time and closure ratio

```text
closedMs = somma degli intervalli validi con stato bilaterale closed
closureFraction = closedMs / validMs
```

`closureFraction` is the experimental temporal closure ratio. It is `null` if
`validMs` is zero. It is never recalculated by the UI or export: all consumers
read the engine value.

`openMs = validMs - closedMs`. `unknownMs = elapsedMs - validMs` includes gaps,
transitions, and missing data; `gapMs` and `calibrationTransitionMs` are
explicit subsets.

## 10 Episodes

An episode begins when the eye or pair transitions to `closed` and ends when it
reopens continuously. It is complete only with cause `reopened`. Loss of
tracking, gaps, calibration change, and stop produce incomplete episodes.

- **Prolonged closure:** complete event with duration at least
  `prolongedClosureMs`.
- **Maximum complete closure:** maximum duration among complete events; `null`
  if there are none.
- **Maximum observed duration:** includes incomplete or ongoing events.

In the sliding window, an event cut by the edge remains visible with its actual
duration and `completeWithinWindow: false`; it is not counted as a complete
closure shorter than that.

## 11 Sampling frequency

The engine uses timestamps, not the number of samples. Two sequences with the
same transition instants and different frequencies produce the same durations
within sampling resolution. Tests verify the same sequence at 10 Hz and 20 Hz
(100 ms and 50 ms), while N05 will have to measure the practical limit with the
real pipeline.

Events shorter than the interval between samples may not be observed. Fixtures
do not attribute certain closed time to this eventuality.

## 12 Limits

- Initial thresholds (`closedEnter = 0.25`, `openExit = 0.4`) are experimental.
- Geometric and calibration thresholds are experimental and must be reviewed in
  N05.
- Normalization depends on the quality of N03 references.
- Glasses, reflections, rotations, and face loss require N05 verification.
- Measurements describe observed behavior and do not produce diagnoses,
  fatigue percentages, or suitability judgments.
