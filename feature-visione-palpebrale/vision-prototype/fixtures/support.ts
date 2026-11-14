import type {
  ClosureEndReason,
  ClosureEvent,
  ClosureKind,
  ClosureStats,
  WindowClosureEvent,
} from '../src/contracts/engine';
import type { ReplayFixture } from '../src/contracts/replay';
import type {
  AnalysisSample,
  EyeInvalidityReason,
  EyeObservation,
} from '../src/contracts/sample';

export const CALIBRATION_A = 'cal-a';
export const CALIBRATION_B = 'cal-b';

export const OPEN = 0.9;
export const CLOSED = 0.1;

export const ZERO_CLOSURES: ClosureStats = Object.freeze({
  episodeCount: 0,
  completeCount: 0,
  incompleteCount: 0,
  prolongedCount: 0,
  longestCompleteMs: null,
  longestObservedMs: null,
});

export function eye(openness: number): EyeObservation {
  return { validity: 'valid', openness };
}

export function invalidEye(
  reasons: readonly [EyeInvalidityReason, ...EyeInvalidityReason[]] = ['not_tracked'],
): EyeObservation {
  return { validity: 'invalid', reasons };
}

export function sample(
  timestampMs: number,
  left: EyeObservation,
  right: EyeObservation,
  calibrationId: string = CALIBRATION_A,
): AnalysisSample {
  return { timestampMs, calibrationId, left, right };
}

export function stateSample(
  timestampMs: number,
  leftOpenness: number | null,
  rightOpenness: number | null,
  calibrationId: string = CALIBRATION_A,
): AnalysisSample {
  return sample(
    timestampMs,
    leftOpenness === null ? invalidEye() : eye(leftOpenness),
    rightOpenness === null ? invalidEye() : eye(rightOpenness),
    calibrationId,
  );
}

export function openSample(
  timestampMs: number,
  calibrationId: string = CALIBRATION_A,
): AnalysisSample {
  return stateSample(timestampMs, OPEN, OPEN, calibrationId);
}

export function closedSample(
  timestampMs: number,
  calibrationId: string = CALIBRATION_A,
): AnalysisSample {
  return stateSample(timestampMs, CLOSED, CLOSED, calibrationId);
}

export function defineFixture(fixture: ReplayFixture): ReplayFixture {
  return fixture;
}

export function event(
  kind: ClosureKind,
  index: number,
  startedAtMs: number,
  endedAtMs: number | null,
  complete: boolean,
  endedReason: ClosureEndReason | null,
  durationMs: number,
  prolonged = false,
): ClosureEvent {
  return {
    id: `${kind}-${index}`,
    kind,
    startedAtMs,
    endedAtMs,
    durationMs,
    complete,
    endedReason,
    prolonged,
  };
}

export function windowEvent(
  closure: ClosureEvent,
  windowOverlapMs: number,
  completeWithinWindow: boolean,
  truncatedAtStart: boolean,
  truncatedAtEnd: boolean,
): WindowClosureEvent {
  return {
    ...closure,
    windowOverlapMs,
    completeWithinWindow,
    truncatedAtStart,
    truncatedAtEnd,
  };
}
