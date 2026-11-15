# Fixture N01/N02

The sequences are defined in `sequences.ts` and are typed with
`ReplayFixture`. Each fixture declares:

- `config`: parameters used by the engine;
- `samples`: already calibrated samples, with timestamps in milliseconds;
- `stopAfterSamples`: whether the session is stopped at the end;
- `expected`: subset of the final snapshot verified by tests.

To replay one without a webcam:

```ts
import { replayFixture } from '../src/analysis/replay';
import { shortClosures } from '../fixtures';

const { snapshot } = replayFixture(shortClosures);
```

The tests in `tests/analysis/fixtures.test.ts` compare `expected` with
`snapshot`; no test uses DOM, React, network, or system timestamps.

## Common Configuration

Unless otherwise indicated:

| Parameter | Value |
| --- | --- |
| `closedEnter` | 0.25 |
| `openExit` | 0.4 |
| `maxGapMs` | 250 |
| `rollingWindowMs` | 10000 |
| `prolongedClosureMs` | 500 |

Open values used in sequences: `0.9`; closed: `0.1`; hysteresis band:
`0.3` and `0.35`.

## Cases and Expected Results

Times in milliseconds. `valid` and `closed` are bilateral unless otherwise noted.

| Fixture | Scenario | Main expected result |
| --- | --- | --- |
| `open-baseline` | Both eyes open for 400 ms | `valid = 400`, `closed = 0`, `coverage = 1`, no events |
| `short-closures` | Two short bilateral closures | `elapsed = 700`, `valid = 700`, `closed = 300`, 2 complete events of 200 and 100 ms |
| `prolonged-closure` | One closure of 800 ms | `closed = 800`, 1 complete prolonged event, maximum complete 800 |
| `wink` | One eye closed for 200 ms, the other open | Bilateral closure `0`; left complete event of 200 ms |
| `tracking-loss` | Eyes not evaluable during closure | `valid = 500`, `closed = 200`, 1 incomplete `tracking_lost` event of 200 ms |
| `time-gap` | Gap of 700 ms beyond `maxGapMs` | `gap = 700`, `valid = 400`, `closed = 100`, incomplete `gap` event of 100 ms |
| `null-valid-time` | All samples invalid | `valid = 0`, `coverage = 0`, `closureFraction = null`, no events |
| `duplicate-out-of-order` | Duplicate and out-of-order timestamp | 4 accepted, 2 rejected; measurement remains `valid = 300`, `closed = 100` |
| `stop-during-closure` | Stop while both eyes are closed | State `stopped`; incomplete `stopped` closure of 100 ms, not prolonged |
| `calibration-change` | Change from `cal-a` to `cal-b` during closure | Transition 100 ms; 1 incomplete `calibration_changed` event and 1 complete event of 200 ms |
| `hysteresis` | Intermediate values in the band | No oscillation; complete events of 300 and 100 ms, `closed = 400` |
| `rolling-window` | Rolling window of 500 ms on closure started before | Session: complete event of 600 ms. Window `[500, 1000]`: overlap 200 ms, `completeWithinWindow = false`, no complete closure |

## Result Notes

- Events have deterministic identifiers by type: `left-N`, `right-N`,
  `bilateral-N`.
- An `endedAtMs: null` indicates an event still ongoing in the snapshot.
- The `rolling-window` fixture verifies that an event cut by the edge does not
  become a shorter complete closure: `durationMs` remains 600, while
  `windowOverlapMs` is 200 and `completeWithinWindow` is false.
- `null-valid-time` demonstrates the difference between `coverage = 0` (observed
  period without valid data) and `closureFraction = null` (no valid time on
  which to calculate the fraction).
