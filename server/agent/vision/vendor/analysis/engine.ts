import type {
  AnalysisSample,
  EyeObservation,
  EyeSide,
} from '../contracts/sample';
import type {
  BilateralState,
  ClosureEndReason,
  ClosureEvent,
  ClosureKind,
  ClosureStats,
  CurrentReadings,
  EngineConfigInput,
  EngineSnapshot,
  EngineStatus,
  EyeReading,
  EyeScopeSnapshot,
  EyeState,
  ProcessSampleResult,
  ResolvedEngineConfig,
  SampleRejection,
  SampleRejectionReason,
  SessionSnapshot,
  WindowClosureEvent,
  WindowSnapshot,
} from '../contracts/engine';
import { EYE_INVALIDITY_REASONS } from '../contracts/sample';
import { resolveEngineConfig } from './config';

const SCHEMA_VERSION = 'n02-snapshot-v1' as const;
const ENGINE_VERSION = 'n02-engine-v1' as const;

const INVALIDITY_REASONS: ReadonlySet<string> = new Set(EYE_INVALIDITY_REASONS);

const KIND_ORDER: Readonly<Record<ClosureKind, number>> = {
  left: 0,
  right: 1,
  bilateral: 2,
};

type IntervalExclusion = 'gap' | 'calibration_change' | null;

interface MutableClosureEvent {
  readonly id: string;
  readonly kind: ClosureKind;
  readonly startedAtMs: number;
  endedAtMs: number | null;
  endedReason: ClosureEndReason | null;
  complete: boolean;
}

interface EyeRuntime {
  state: EyeState;
  active: MutableClosureEvent | null;
}

interface IntervalRecord {
  readonly startMs: number;
  readonly endMs: number;
  readonly excluded: IntervalExclusion;
  readonly leftValid: boolean;
  readonly rightValid: boolean;
  readonly leftState: EyeState;
  readonly rightState: EyeState;
  readonly bilateralState: BilateralState;
  readonly bilateralValid: boolean;
}

interface ValidationSuccess {
  readonly ok: true;
}

interface ValidationFailure {
  readonly ok: false;
  readonly reason: SampleRejectionReason;
  readonly message: string;
}

type SampleValidation = ValidationSuccess | ValidationFailure;

export class EngineStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EngineStateError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isValidTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isValidCalibrationId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isEyeObservation(value: unknown): value is EyeObservation {
  if (!isRecord(value)) {
    return false;
  }

  if (value.validity === 'valid') {
    return typeof value.openness === 'number' && Number.isFinite(value.openness);
  }

  if (value.validity === 'invalid') {
    return (
      Array.isArray(value.reasons) &&
      value.reasons.length > 0 &&
      !('openness' in value) &&
      value.reasons.every(
        (reason) => typeof reason === 'string' && INVALIDITY_REASONS.has(reason),
      )
    );
  }

  return false;
}

function validateSample(value: unknown): SampleValidation {
  if (!isRecord(value)) {
    return { ok: false, reason: 'invalid_eye_observation', message: 'Il campione non è un oggetto.' };
  }

  if (!isValidTimestamp(value.timestampMs)) {
    return {
      ok: false,
      reason: 'invalid_timestamp',
      message: 'timestampMs deve essere un numero finito e non negativo.',
    };
  }

  if (!isValidCalibrationId(value.calibrationId)) {
    return {
      ok: false,
      reason: 'invalid_calibration_id',
      message: 'calibrationId deve essere una stringa non vuota.',
    };
  }

  if (!isEyeObservation(value.left)) {
    return {
      ok: false,
      reason: 'invalid_eye_observation',
      message: 'Il campione dell’occhio sinistro non rispetta il contratto.',
    };
  }

  if (!isEyeObservation(value.right)) {
    return {
      ok: false,
      reason: 'invalid_eye_observation',
      message: 'Il campione dell’occhio destro non rispetta il contratto.',
    };
  }

  return { ok: true };
}

function nextEyeState(
  previous: EyeState,
  openness: number,
  config: ResolvedEngineConfig,
): EyeState {
  if (previous === 'closed') {
    return openness >= config.openExit ? 'open' : 'closed';
  }

  return openness <= config.closedEnter ? 'closed' : 'open';
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function closureStats(
  events: readonly ClosureEvent[],
  kind: ClosureKind,
  prolongedClosureMs: number,
): ClosureStats {
  const selected = events.filter((event) => event.kind === kind);
  let completeCount = 0;
  let prolongedCount = 0;
  let longestCompleteMs: number | null = null;
  let longestObservedMs: number | null = null;

  for (const event of selected) {
    if (longestObservedMs === null || event.durationMs > longestObservedMs) {
      longestObservedMs = event.durationMs;
    }

    if (event.complete) {
      completeCount += 1;

      if (longestCompleteMs === null || event.durationMs > longestCompleteMs) {
        longestCompleteMs = event.durationMs;
      }

      if (event.durationMs >= prolongedClosureMs) {
        prolongedCount += 1;
      }
    }
  }

  return Object.freeze({
    episodeCount: selected.length,
    completeCount,
    incompleteCount: selected.length - completeCount,
    prolongedCount,
    longestCompleteMs,
    longestObservedMs,
  });
}

function windowClosureStats(
  events: readonly WindowClosureEvent[],
  kind: ClosureKind,
  prolongedClosureMs: number,
): ClosureStats {
  const selected = events.filter((event) => event.kind === kind);
  let completeCount = 0;
  let prolongedCount = 0;
  let longestCompleteMs: number | null = null;
  let longestObservedMs: number | null = null;

  for (const event of selected) {
    if (longestObservedMs === null || event.windowOverlapMs > longestObservedMs) {
      longestObservedMs = event.windowOverlapMs;
    }

    if (event.completeWithinWindow) {
      completeCount += 1;

      if (longestCompleteMs === null || event.durationMs > longestCompleteMs) {
        longestCompleteMs = event.durationMs;
      }

      if (event.durationMs >= prolongedClosureMs) {
        prolongedCount += 1;
      }
    }
  }

  return Object.freeze({
    episodeCount: selected.length,
    completeCount,
    incompleteCount: selected.length - completeCount,
    prolongedCount,
    longestCompleteMs,
    longestObservedMs,
  });
}

function emptyEyeScope(
  elapsedMs: number,
  kind: ClosureKind,
  prolongedClosureMs: number,
  allEvents: readonly ClosureEvent[],
): EyeScopeSnapshot {
  return Object.freeze({
    validMs: 0,
    closedMs: 0,
    openMs: 0,
    coverage: ratio(0, elapsedMs),
    closureFraction: null,
    closures: closureStats(allEvents, kind, prolongedClosureMs),
  });
}

/**
 * Motore temporale puro.
 *
 * Non dipende da DOM, React, webcam, rete o runtime di inferenza. L'unico
 * ingresso è `AnalysisSample`; l'unica uscita consumabile è `EngineSnapshot`.
 */
export class TemporalEngine {
  private readonly config: ResolvedEngineConfig;
  private status: EngineStatus = 'idle';

  private calibrationIds: string[] = [];
  private activeCalibrationId: string | null = null;
  private calibrationChanges = 0;

  private acceptedSamples = 0;
  private rejectedSamples = 0;
  private rejections: SampleRejection[] = [];

  private firstTimestampMs: number | null = null;
  private lastTimestampMs: number | null = null;
  private lastSample: AnalysisSample | null = null;

  private left: EyeRuntime = { state: 'unknown', active: null };
  private right: EyeRuntime = { state: 'unknown', active: null };
  private bilateralState: BilateralState = 'unknown';
  private bilateralActive: MutableClosureEvent | null = null;

  private eyeEventCounters: Record<EyeSide, number> = { left: 0, right: 0 };
  private bilateralEventCounter = 0;

  private sessionEvents: MutableClosureEvent[] = [];
  private intervals: IntervalRecord[] = [];

  private sessionLeftValidMs = 0;
  private sessionLeftClosedMs = 0;
  private sessionRightValidMs = 0;
  private sessionRightClosedMs = 0;
  private sessionValidMs = 0;
  private sessionClosedMs = 0;
  private sessionGapMs = 0;
  private sessionCalibrationTransitionMs = 0;

  constructor(config: EngineConfigInput = {}) {
    this.config = resolveEngineConfig(config);
  }

  /** Avvia una nuova sessione e azzera ogni risultato precedente. */
  start(): void {
    this.resetInternal();
    this.status = 'running';
  }

  /**
   * Elabora un campione.
   *
   * I campioni malformati o non monotoni vengono rifiutati e non modificano la
   * misura. Chiamare `processSample` senza `start`, o dopo `stop`, è un errore
   * d'uso e lancia `EngineStateError`.
   */
  processSample(sample: AnalysisSample): ProcessSampleResult {
    if (this.status !== 'running') {
      throw new EngineStateError(
        'Il motore non è in esecuzione: chiamare start() prima di processSample().',
      );
    }

    const raw: unknown = sample;
    const validation = validateSample(raw);

    if (!validation.ok) {
      const timestampMs =
        isRecord(raw) && isValidTimestamp(raw.timestampMs) ? raw.timestampMs : null;
      return this.reject(timestampMs, validation.reason, validation.message);
    }

    const parsed = raw as AnalysisSample;
    const timestampMs = parsed.timestampMs;

    if (this.lastTimestampMs !== null) {
      if (timestampMs === this.lastTimestampMs) {
        return this.reject(
          timestampMs,
          'duplicate_timestamp',
          'Il timestamp coincide con il campione precedente.',
        );
      }

      if (timestampMs < this.lastTimestampMs) {
        return this.reject(
          timestampMs,
          'out_of_order_timestamp',
          'Il timestamp è precedente al campione accettato precedente.',
        );
      }
    }

    const intervalMs =
      this.lastTimestampMs === null ? 0 : timestampMs - this.lastTimestampMs;
    const calibrationChanged =
      this.activeCalibrationId !== null &&
      parsed.calibrationId !== this.activeCalibrationId;

    if (this.lastTimestampMs === null) {
      this.firstTimestampMs = timestampMs;
      this.registerCalibration(parsed.calibrationId);
    } else {
      this.accountInterval(intervalMs, calibrationChanged);

      if (calibrationChanged) {
        this.endActiveEvents(this.lastTimestampMs, 'calibration_changed');
        this.resetContinuity();
        this.calibrationChanges += 1;
        this.registerCalibration(parsed.calibrationId);
      } else if (intervalMs > this.config.maxGapMs) {
        this.endActiveEvents(this.lastTimestampMs, 'gap');
        this.resetContinuity();
      }
    }

    this.acceptedSamples += 1;
    this.lastTimestampMs = timestampMs;
    this.lastSample = parsed;

    this.applyEyeObservation('left', parsed.left, timestampMs);
    this.applyEyeObservation('right', parsed.right, timestampMs);
    this.applyBilateral(parsed.left, parsed.right, timestampMs);

    return Object.freeze({
      status: 'accepted' as const,
      timestampMs,
      intervalMs,
      gap: !calibrationChanged && intervalMs > this.config.maxGapMs,
      calibrationChanged,
    });
  }

  /**
   * Istantanea immutabile della sessione, della finestra mobile e dello stato
   * corrente. È sicuro chiamarla più volte: non modifica la misura.
   */
  getSnapshot(): EngineSnapshot {
    const events = this.collectSessionEvents();
    const session = this.buildSessionSnapshot(events);
    const window = this.buildWindowSnapshot(events);

    return Object.freeze({
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      status: this.status,
      config: this.config,
      calibrationIds: Object.freeze([...this.calibrationIds]),
      diagnostics: Object.freeze({
        acceptedSamples: this.acceptedSamples,
        rejectedSamples: this.rejectedSamples,
        rejections: Object.freeze([...this.rejections]),
        calibrationChanges: this.calibrationChanges,
      }),
      session,
      window,
      current: this.buildCurrent(),
    });
  }

  /**
   * Arresta la sessione. Un episodio ancora aperto diventa incompleto con
   * motivo `stopped` e non viene prolungato fino all'istante della chiamata.
   */
  stop(): void {
    if (this.status !== 'running') {
      return;
    }

    this.endActiveEvents(this.lastTimestampMs, 'stopped');
    this.status = 'stopped';
  }

  /** Riporta il motore in `idle` e cancella tutti i risultati. */
  reset(): void {
    this.resetInternal();
    this.status = 'idle';
  }

  private registerCalibration(calibrationId: string): void {
    this.activeCalibrationId = calibrationId;

    if (!this.calibrationIds.includes(calibrationId)) {
      this.calibrationIds.push(calibrationId);
    }
  }

  private reject(
    timestampMs: number | null,
    reason: SampleRejectionReason,
    message: string,
  ): ProcessSampleResult {
    const rejection: SampleRejection = Object.freeze({ timestampMs, reason, message });
    this.rejections.push(rejection);
    this.rejectedSamples += 1;
    return Object.freeze({ status: 'rejected', timestampMs, reason, message });
  }

  private accountInterval(intervalMs: number, calibrationChanged: boolean): void {
    const previousTimestampMs = this.lastTimestampMs;
    const previousSample = this.lastSample;

    if (previousTimestampMs === null || previousSample === null) {
      return;
    }

    const leftValid = previousSample.left.validity === 'valid';
    const rightValid = previousSample.right.validity === 'valid';
    const bilateralValid = leftValid && rightValid;
    const excluded: IntervalExclusion = calibrationChanged
      ? 'calibration_change'
      : intervalMs > this.config.maxGapMs
        ? 'gap'
        : null;

    this.intervals.push({
      startMs: previousTimestampMs,
      endMs: previousTimestampMs + intervalMs,
      excluded,
      leftValid,
      rightValid,
      leftState: this.left.state,
      rightState: this.right.state,
      bilateralState: this.bilateralState,
      bilateralValid,
    });

    if (excluded === 'calibration_change') {
      this.sessionCalibrationTransitionMs += intervalMs;
      return;
    }

    if (excluded === 'gap') {
      this.sessionGapMs += intervalMs;
      return;
    }

    if (leftValid) {
      this.sessionLeftValidMs += intervalMs;
      if (this.left.state === 'closed') {
        this.sessionLeftClosedMs += intervalMs;
      }
    }

    if (rightValid) {
      this.sessionRightValidMs += intervalMs;
      if (this.right.state === 'closed') {
        this.sessionRightClosedMs += intervalMs;
      }
    }

    if (bilateralValid) {
      this.sessionValidMs += intervalMs;
      if (this.bilateralState === 'closed') {
        this.sessionClosedMs += intervalMs;
      }
    }
  }

  private applyEyeObservation(
    side: EyeSide,
    observation: EyeObservation,
    atMs: number,
  ): void {
    const runtime = this.eyeRuntime(side);

    if (observation.validity === 'invalid') {
      if (runtime.active !== null) {
        this.finishEyeEvent(side, atMs, 'tracking_lost');
      }
      runtime.state = 'unknown';
      return;
    }

    const next = nextEyeState(runtime.state, observation.openness, this.config);

    if (runtime.state !== 'closed' && next === 'closed') {
      this.startEyeEvent(side, atMs);
    } else if (runtime.state === 'closed' && next !== 'closed') {
      this.finishEyeEvent(side, atMs, 'reopened');
    }

    runtime.state = next;
  }

  private applyBilateral(
    left: EyeObservation,
    right: EyeObservation,
    atMs: number,
  ): void {
    let next: BilateralState;

    if (left.validity === 'invalid' || right.validity === 'invalid') {
      next = 'unknown';
    } else if (this.left.state === 'closed' && this.right.state === 'closed') {
      next = 'closed';
    } else if (this.left.state === 'open' && this.right.state === 'open') {
      next = 'open';
    } else {
      next = 'mixed';
    }

    if (this.bilateralState !== 'closed' && next === 'closed') {
      this.startBilateralEvent(atMs);
    } else if (this.bilateralState === 'closed' && next !== 'closed') {
      this.finishBilateralEvent(
        atMs,
        next === 'unknown' ? 'tracking_lost' : 'reopened',
      );
    }

    this.bilateralState = next;
  }

  private eyeRuntime(side: EyeSide): EyeRuntime {
    return side === 'left' ? this.left : this.right;
  }

  private startEyeEvent(side: EyeSide, atMs: number): void {
    const runtime = this.eyeRuntime(side);

    if (runtime.active !== null) {
      return;
    }

    this.eyeEventCounters[side] += 1;
    const event: MutableClosureEvent = {
      id: `${side}-${this.eyeEventCounters[side]}`,
      kind: side,
      startedAtMs: atMs,
      endedAtMs: null,
      endedReason: null,
      complete: false,
    };

    runtime.active = event;
    this.sessionEvents.push(event);
  }

  private finishEyeEvent(
    side: EyeSide,
    atMs: number,
    reason: ClosureEndReason,
  ): void {
    const runtime = this.eyeRuntime(side);
    this.finishEvent(runtime.active, atMs, reason);
    runtime.active = null;
  }

  private startBilateralEvent(atMs: number): void {
    if (this.bilateralActive !== null) {
      return;
    }

    this.bilateralEventCounter += 1;
    const event: MutableClosureEvent = {
      id: `bilateral-${this.bilateralEventCounter}`,
      kind: 'bilateral',
      startedAtMs: atMs,
      endedAtMs: null,
      endedReason: null,
      complete: false,
    };

    this.bilateralActive = event;
    this.sessionEvents.push(event);
  }

  private finishBilateralEvent(
    atMs: number,
    reason: ClosureEndReason,
  ): void {
    this.finishEvent(this.bilateralActive, atMs, reason);
    this.bilateralActive = null;
  }

  private finishEvent(
    event: MutableClosureEvent | null,
    atMs: number,
    reason: ClosureEndReason,
  ): void {
    if (event === null || event.endedAtMs !== null) {
      return;
    }

    event.endedAtMs = atMs;
    event.endedReason = reason;
    event.complete = reason === 'reopened';
  }

  private endActiveEvents(atMs: number | null, reason: ClosureEndReason): void {
    if (atMs === null) {
      return;
    }

    this.finishEyeEvent('left', atMs, reason);
    this.finishEyeEvent('right', atMs, reason);
    this.finishBilateralEvent(atMs, reason);
  }

  private resetContinuity(): void {
    this.left = { state: 'unknown', active: null };
    this.right = { state: 'unknown', active: null };
    this.bilateralState = 'unknown';
    this.bilateralActive = null;
  }

  private resetInternal(): void {
    this.calibrationIds = [];
    this.activeCalibrationId = null;
    this.calibrationChanges = 0;

    this.acceptedSamples = 0;
    this.rejectedSamples = 0;
    this.rejections = [];

    this.firstTimestampMs = null;
    this.lastTimestampMs = null;
    this.lastSample = null;

    this.left = { state: 'unknown', active: null };
    this.right = { state: 'unknown', active: null };
    this.bilateralState = 'unknown';
    this.bilateralActive = null;

    this.eyeEventCounters = { left: 0, right: 0 };
    this.bilateralEventCounter = 0;

    this.sessionEvents = [];
    this.intervals = [];

    this.sessionLeftValidMs = 0;
    this.sessionLeftClosedMs = 0;
    this.sessionRightValidMs = 0;
    this.sessionRightClosedMs = 0;
    this.sessionValidMs = 0;
    this.sessionClosedMs = 0;
    this.sessionGapMs = 0;
    this.sessionCalibrationTransitionMs = 0;
  }

  private collectSessionEvents(): readonly ClosureEvent[] {
    return Object.freeze(
      [...this.sessionEvents]
        .sort(
          (left, right) =>
            left.startedAtMs - right.startedAtMs ||
            KIND_ORDER[left.kind] - KIND_ORDER[right.kind] ||
            left.id.localeCompare(right.id),
        )
        .map((event) => this.toClosureEvent(event)),
    );
  }

  private toClosureEvent(event: MutableClosureEvent): ClosureEvent {
    const endedAtMs = event.endedAtMs;
    const referenceEndMs = endedAtMs ?? this.lastTimestampMs ?? event.startedAtMs;
    const durationMs = Math.max(0, referenceEndMs - event.startedAtMs);
    const complete = event.complete && endedAtMs !== null;

    return Object.freeze({
      id: event.id,
      kind: event.kind,
      startedAtMs: event.startedAtMs,
      endedAtMs,
      durationMs,
      complete,
      endedReason: event.endedReason,
      prolonged: complete && durationMs >= this.config.prolongedClosureMs,
    });
  }

  private buildSessionSnapshot(
    events: readonly ClosureEvent[],
  ): SessionSnapshot {
    const startMs = this.firstTimestampMs;
    const endMs = this.lastTimestampMs;
    const elapsedMs =
      startMs !== null && endMs !== null ? Math.max(0, endMs - startMs) : 0;

    return Object.freeze({
      startMs,
      endMs,
      elapsedMs,
      validMs: this.sessionValidMs,
      closedMs: this.sessionClosedMs,
      openMs: this.sessionValidMs - this.sessionClosedMs,
      unknownMs: elapsedMs - this.sessionValidMs,
      coverage: ratio(this.sessionValidMs, elapsedMs),
      closureFraction: ratio(this.sessionClosedMs, this.sessionValidMs),
      gapMs: this.sessionGapMs,
      calibrationTransitionMs: this.sessionCalibrationTransitionMs,
      closures: closureStats(events, 'bilateral', this.config.prolongedClosureMs),
      left: this.buildEyeScope(
        this.sessionLeftValidMs,
        this.sessionLeftClosedMs,
        elapsedMs,
        events,
        'left',
      ),
      right: this.buildEyeScope(
        this.sessionRightValidMs,
        this.sessionRightClosedMs,
        elapsedMs,
        events,
        'right',
      ),
      events,
    });
  }

  private buildEyeScope(
    validMs: number,
    closedMs: number,
    elapsedMs: number,
    events: readonly ClosureEvent[],
    side: EyeSide,
  ): EyeScopeSnapshot {
    return Object.freeze({
      validMs,
      closedMs,
      openMs: validMs - closedMs,
      coverage: ratio(validMs, elapsedMs),
      closureFraction: ratio(closedMs, validMs),
      closures: closureStats(events, side, this.config.prolongedClosureMs),
    });
  }

  private buildWindowSnapshot(
    events: readonly ClosureEvent[],
  ): WindowSnapshot {
    const startMs = this.firstTimestampMs;
    const endMs = this.lastTimestampMs;

    if (startMs === null || endMs === null) {
      const elapsedMs = 0;
      const emptyEvents = Object.freeze([]);

      return Object.freeze({
        startMs: null,
        endMs: null,
        elapsedMs,
        validMs: 0,
        closedMs: 0,
        openMs: 0,
        unknownMs: 0,
        coverage: null,
        closureFraction: null,
        gapMs: 0,
        calibrationTransitionMs: 0,
        closures: closureStats([], 'bilateral', this.config.prolongedClosureMs),
        left: emptyEyeScope(elapsedMs, 'left', this.config.prolongedClosureMs, []),
        right: emptyEyeScope(elapsedMs, 'right', this.config.prolongedClosureMs, []),
        events: emptyEvents,
      });
    }

    const windowStartMs = Math.max(startMs, endMs - this.config.rollingWindowMs);
    const windowEndMs = endMs;
    const elapsedMs = windowEndMs - windowStartMs;

    let validMs = 0;
    let closedMs = 0;
    let leftValidMs = 0;
    let leftClosedMs = 0;
    let rightValidMs = 0;
    let rightClosedMs = 0;
    let gapMs = 0;
    let calibrationTransitionMs = 0;

    for (const interval of this.intervals) {
      const overlapStartMs = Math.max(interval.startMs, windowStartMs);
      const overlapEndMs = Math.min(interval.endMs, windowEndMs);

      if (overlapEndMs <= overlapStartMs) {
        continue;
      }

      const overlapMs = overlapEndMs - overlapStartMs;

      if (interval.excluded === 'gap') {
        gapMs += overlapMs;
        continue;
      }

      if (interval.excluded === 'calibration_change') {
        calibrationTransitionMs += overlapMs;
        continue;
      }

      if (interval.leftValid) {
        leftValidMs += overlapMs;
        if (interval.leftState === 'closed') {
          leftClosedMs += overlapMs;
        }
      }

      if (interval.rightValid) {
        rightValidMs += overlapMs;
        if (interval.rightState === 'closed') {
          rightClosedMs += overlapMs;
        }
      }

      if (interval.bilateralValid) {
        validMs += overlapMs;
        if (interval.bilateralState === 'closed') {
          closedMs += overlapMs;
        }
      }
    }

    const windowEvents = this.collectWindowEvents(
      events,
      windowStartMs,
      windowEndMs,
    );

    return Object.freeze({
      startMs: windowStartMs,
      endMs: windowEndMs,
      elapsedMs,
      validMs,
      closedMs,
      openMs: validMs - closedMs,
      unknownMs: elapsedMs - validMs,
      coverage: ratio(validMs, elapsedMs),
      closureFraction: ratio(closedMs, validMs),
      gapMs,
      calibrationTransitionMs,
      closures: windowClosureStats(
        windowEvents,
        'bilateral',
        this.config.prolongedClosureMs,
      ),
      left: Object.freeze({
        validMs: leftValidMs,
        closedMs: leftClosedMs,
        openMs: leftValidMs - leftClosedMs,
        coverage: ratio(leftValidMs, elapsedMs),
        closureFraction: ratio(leftClosedMs, leftValidMs),
        closures: windowClosureStats(
          windowEvents,
          'left',
          this.config.prolongedClosureMs,
        ),
      }),
      right: Object.freeze({
        validMs: rightValidMs,
        closedMs: rightClosedMs,
        openMs: rightValidMs - rightClosedMs,
        coverage: ratio(rightValidMs, elapsedMs),
        closureFraction: ratio(rightClosedMs, rightValidMs),
        closures: windowClosureStats(
          windowEvents,
          'right',
          this.config.prolongedClosureMs,
        ),
      }),
      events: windowEvents,
    });
  }

  private collectWindowEvents(
    events: readonly ClosureEvent[],
    windowStartMs: number,
    windowEndMs: number,
  ): readonly WindowClosureEvent[] {
    const windowEvents: WindowClosureEvent[] = [];

    for (const event of events) {
      const eventEndMs = event.endedAtMs ?? windowEndMs;

      if (eventEndMs <= windowStartMs || event.startedAtMs >= windowEndMs) {
        continue;
      }

      const overlapStartMs = Math.max(event.startedAtMs, windowStartMs);
      const overlapEndMs = Math.min(eventEndMs, windowEndMs);
      const windowOverlapMs = overlapEndMs - overlapStartMs;

      if (windowOverlapMs <= 0) {
        continue;
      }

      const truncatedAtStart = event.startedAtMs < windowStartMs;
      const truncatedAtEnd = event.endedAtMs === null || event.endedAtMs > windowEndMs;
      const completeWithinWindow =
        event.complete && !truncatedAtStart && !truncatedAtEnd;

      windowEvents.push(
        Object.freeze({
          ...event,
          windowOverlapMs,
          completeWithinWindow,
          truncatedAtStart,
          truncatedAtEnd,
        }),
      );
    }

    return Object.freeze(windowEvents);
  }

  private buildCurrent(): CurrentReadings {
    const sample = this.lastSample;
    const active = Object.freeze({
      left: this.left.active === null ? null : this.toClosureEvent(this.left.active),
      right: this.right.active === null ? null : this.toClosureEvent(this.right.active),
      bilateral:
        this.bilateralActive === null
          ? null
          : this.toClosureEvent(this.bilateralActive),
    });

    return Object.freeze({
      timestampMs: this.lastTimestampMs,
      calibrationId: this.activeCalibrationId,
      left: this.buildEyeReading('left', sample),
      right: this.buildEyeReading('right', sample),
      bilateral: this.bilateralState,
      active,
    });
  }

  private buildEyeReading(
    side: EyeSide,
    sample: AnalysisSample | null,
  ): EyeReading {
    const observation = sample === null
      ? null
      : side === 'left'
        ? sample.left
        : sample.right;

    if (observation?.validity === 'valid') {
      return Object.freeze({
        state: this.eyeRuntime(side).state,
        openness: observation.openness,
        valid: true,
      });
    }

    return Object.freeze({
      state: this.eyeRuntime(side).state,
      openness: null,
      valid: false,
    });
  }
}
