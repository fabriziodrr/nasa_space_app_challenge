import type {
  CalibrationConfigInput,
  CalibrationConfigValues,
  CalibrationEyeOutcome,
  CalibrationEyeFailureReason as CalibrationFailureReason,
  CalibrationFailureReason as ApplicationCalibrationFailureReason,
  CalibrationOutcome,
  CalibrationPhase,
  CalibrationPhaseProgress,
  CalibrationProfile,
  CalibrationProgress,
  CalibrationStatus,
  CalibrationState,
  CompleteCalibrationOptions,
  EyeCalibrationReferences,
  ResolvedCalibrationConfig,
} from '../contracts/calibration';
import type {
  EyeGeometryObservation,
  FaceGeometryObservation,
} from '../contracts/geometry';
import type {
  AnalysisSample,
  EyeObservation,
  EyeSide,
} from '../contracts/sample';

/**
 * Valori iniziali sperimentali della calibrazione.
 *
 * Otto campioni per occhio e fase a una frequenza di circa 10–30 Hz
 * corrispondono a una raccolta breve. Le soglie vanno riviste in N05.
 */
export const DEFAULT_CALIBRATION_CONFIG: Readonly<CalibrationConfigValues> =
  Object.freeze({
    requiredSamplesPerEye: 8,
    maxReferenceDeviation: 0.05,
    minimumSeparation: 0.05,
  });

export const DEFAULT_CALIBRATION_VERSION = 'n03-calibration-v1';

export class CalibrationConfigError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Configurazione di calibrazione non valida: ${issues.join('; ')}`);
    this.name = 'CalibrationConfigError';
    this.issues = Object.freeze([...issues]);
  }
}

export class CalibrationStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CalibrationStateError';
  }
}

export function resolveCalibrationConfig(
  input: CalibrationConfigInput = {},
): ResolvedCalibrationConfig {
  const values: CalibrationConfigValues = {
    requiredSamplesPerEye:
      input.requiredSamplesPerEye ?? DEFAULT_CALIBRATION_CONFIG.requiredSamplesPerEye,
    maxReferenceDeviation:
      input.maxReferenceDeviation ?? DEFAULT_CALIBRATION_CONFIG.maxReferenceDeviation,
    minimumSeparation:
      input.minimumSeparation ?? DEFAULT_CALIBRATION_CONFIG.minimumSeparation,
  };

  const issues: string[] = [];

  if (
    !Number.isInteger(values.requiredSamplesPerEye) ||
    values.requiredSamplesPerEye < 2
  ) {
    issues.push('requiredSamplesPerEye deve essere un intero almeno 2');
  }
  if (
    !Number.isFinite(values.maxReferenceDeviation) ||
    values.maxReferenceDeviation < 0
  ) {
    issues.push('maxReferenceDeviation deve essere finito e non negativo');
  }
  if (!Number.isFinite(values.minimumSeparation) || values.minimumSeparation <= 0) {
    issues.push('minimumSeparation deve essere finito e maggiore di 0');
  }

  if (issues.length > 0) {
    throw new CalibrationConfigError(issues);
  }

  const configId = [
    'n03-calibration-v1',
    `requiredSamplesPerEye=${values.requiredSamplesPerEye}`,
    `maxReferenceDeviation=${values.maxReferenceDeviation}`,
    `minimumSeparation=${values.minimumSeparation}`,
  ].join('|');

  return Object.freeze({ ...values, configId });
}

type SamplesByEye = Record<EyeSide, number[]>;
type CountsByEye = Record<EyeSide, number>;

function emptySamples(): SamplesByEye {
  return { left: [], right: [] };
}

function uniqueReasons(
  reasons: readonly CalibrationFailureReason[],
): readonly CalibrationFailureReason[] {
  return Object.freeze([...new Set(reasons)]);
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? null;
  }

  const lower = sorted[middle - 1];
  const upper = sorted[middle];

  if (lower === undefined || upper === undefined) {
    return null;
  }

  return (lower + upper) / 2;
}

function maxDeviation(values: readonly number[], center: number): number | null {
  if (values.length === 0) {
    return null;
  }

  let maximum = 0;

  for (const value of values) {
    maximum = Math.max(maximum, Math.abs(value - center));
  }

  return maximum;
}

function validEyeAspectRatio(observation: EyeGeometryObservation): number | null {
  if (
    !observation.valid ||
    !Number.isFinite(observation.eyeAspectRatio) ||
    observation.eyeAspectRatio < 0
  ) {
    return null;
  }

  return observation.eyeAspectRatio;
}

function eyeObservationFor(
  observation: EyeGeometryObservation,
  references: EyeCalibrationReferences,
): EyeObservation {
  if (
    !observation.valid ||
    !Number.isFinite(observation.eyeAspectRatio) ||
    observation.eyeAspectRatio < 0
  ) {
    return Object.freeze({
      validity: 'invalid' as const,
      reasons: !observation.valid
        ? observation.invalidityReasons
        : Object.freeze(['geometry_invalid'] as const),
    });
  }

  return Object.freeze({
    validity: 'valid' as const,
    openness: normalizeOpenness(observation.eyeAspectRatio, references),
  });
}

/**
 * Normalizza un rapporto palpebrale con i riferimenti di un occhio.
 *
 * La formula è `(ear - closed) / (open - closed)`.
 * Il risultato non viene tagliato: valori fuori da [0, 1] restano disponibili
 * come segnale di rumore o movimento.
 */
export function normalizeOpenness(
  eyeAspectRatio: number,
  references: EyeCalibrationReferences,
): number {
  if (!Number.isFinite(eyeAspectRatio)) {
    throw new RangeError('Il rapporto palpebrale deve essere un numero finito.');
  }

  const separation = references.open - references.closed;

  if (!Number.isFinite(separation) || separation <= 0) {
    throw new RangeError(
      'I riferimenti di calibrazione non hanno una separazione positiva.',
    );
  }

  return (eyeAspectRatio - references.closed) / separation;
}

/** Converte la geometria dei due occhi nelle osservazioni per il motore. */
export function calibrateFaceGeometry(
  observation: FaceGeometryObservation,
  profile: CalibrationProfile,
): Readonly<Record<EyeSide, EyeObservation>> {
  if (observation.methodVersion !== profile.methodVersion) {
    throw new CalibrationStateError('La geometria non corrisponde al metodo del profilo di calibrazione.');
  }
  return Object.freeze({
    left: eyeObservationFor(observation.left, profile.eyes.left),
    right: eyeObservationFor(observation.right, profile.eyes.right),
  });
}

/** Crea il campione calibrato da offrire a `TemporalEngine.processSample`. */
export function toAnalysisSample(
  observation: FaceGeometryObservation,
  profile: CalibrationProfile,
): AnalysisSample {
  const eyes = calibrateFaceGeometry(observation, profile);

  return Object.freeze({
    timestampMs: observation.timestampMs,
    calibrationId: profile.id,
    left: eyes.left,
    right: eyes.right,
  });
}

/** Traduce i dettagli N03 nello stato applicativo stabile C01 senza ricalcoli. */
export function toCalibrationState(
  progress: CalibrationProgress,
  outcome?: CalibrationOutcome,
): CalibrationState {
  if (progress.status === 'idle') return Object.freeze({ status: 'idle' });
  if (progress.status === 'completed' || progress.status === 'failed') {
    if (!outcome || outcome.status !== progress.status) {
      throw new CalibrationStateError('Lo stato terminale richiede l’esito della raccolta corrente.');
    }
    if (outcome.success && outcome.profile !== null) {
      return Object.freeze({ status: 'ready', profile: outcome.profile });
    }
    const reasons = new Set<ApplicationCalibrationFailureReason>();
    for (const reason of outcome.reasons) {
      if (reason === 'not_enough_open_samples' || reason === 'not_enough_closed_samples') {
        reasons.add('insufficient_samples');
      } else if (reason === 'separation_too_small') reasons.add('insufficient_separation');
      else reasons.add('unstable_reference');
    }
    const [first = 'invalid_geometry', ...rest] = reasons;
    return Object.freeze({ status: 'insufficient', reasons: Object.freeze([first, ...rest] as const), details: outcome.reasons });
  }
  const reference = progress.activePhase ?? (progress.open.complete ? 'closed' : 'open');
  const phase = progress[reference];
  return Object.freeze({
    status: 'collecting', reference, acceptedSamples: phase.samples,
    requiredSamplesPerEye: phase.requiredPerEye,
  });
}

/**
 * Raccolta guidata dei riferimenti aperto e chiuso.
 *
 * La classe non usa orologio, DOM o rete. La UI decide quando iniziare una
 * fase, offre i campioni geometrici validi e chiama `finish` con un
 * identificativo e un timestamp forniti dall'applicazione.
 */
export class CalibrationCollector {
  private readonly config: ResolvedCalibrationConfig;
  private openSamples: SamplesByEye = emptySamples();
  private closedSamples: SamplesByEye = emptySamples();
  private activePhase: CalibrationPhase | null = null;
  private terminalStatus: 'completed' | 'failed' | null = null;
  private methodVersion: string | null = null;

  constructor(config: CalibrationConfigInput = {}) {
    this.config = resolveCalibrationConfig(config);
  }

  getConfig(): ResolvedCalibrationConfig { return this.config; }

  /** Reset la raccolta e comincia la fase aperta. */
  start(): void {
    this.reset();
    this.beginPhase('open');
  }

  /** Cancella campioni, avanzamento ed esito precedente. */
  reset(): void {
    this.openSamples = emptySamples();
    this.closedSamples = emptySamples();
    this.activePhase = null;
    this.terminalStatus = null;
    this.methodVersion = null;
  }

  /**
   * Prepara la raccolta di una fase.
   *
   * Se la calibrazione precedente era conclusa, entrambe le fasi vengono
   * azzerate. Altrimenti viene azzerata solo la fase richiesta.
   */
  beginPhase(phase: CalibrationPhase): void {
    if (phase !== 'open' && phase !== 'closed') {
      throw new CalibrationStateError('Fase di calibrazione non riconosciuta.');
    }

    if (this.terminalStatus !== null) {
      this.openSamples = emptySamples();
      this.closedSamples = emptySamples();
      this.terminalStatus = null;
      this.methodVersion = null;
    }

    if (phase === 'open') {
      this.openSamples = emptySamples();
    } else {
      this.closedSamples = emptySamples();
    }

    this.activePhase = phase;
  }

  /**
   * Aggiunge un'osservazione alla fase attiva.
   *
   * Gli occhi non validi non contribuiscono ai riferimenti. Il progresso
   * restituito permette alla UI di aggiornare la raccolta senza ricalcolare le
   * soglie.
   */
  addSample(observation: FaceGeometryObservation): CalibrationProgress {
    if (this.activePhase === null || this.terminalStatus !== null) {
      throw new CalibrationStateError(
        'Nessuna fase di calibrazione attiva: chiamare beginPhase().',
      );
    }

    if (!observation.methodVersion.trim()) {
      throw new CalibrationStateError('La geometria deve dichiarare methodVersion.');
    }
    if (this.methodVersion !== null && this.methodVersion !== observation.methodVersion) {
      throw new CalibrationStateError('Il metodo geometrico è cambiato: azzerare e ripetere la calibrazione.');
    }
    this.methodVersion = observation.methodVersion;

    const target = this.activePhase === 'open'
      ? this.openSamples
      : this.closedSamples;

    const left = validEyeAspectRatio(observation.left);
    if (left !== null && target.left.length < this.config.requiredSamplesPerEye) {
      target.left.push(left);
    }

    const right = validEyeAspectRatio(observation.right);
    if (right !== null && target.right.length < this.config.requiredSamplesPerEye) {
      target.right.push(right);
    }

    return this.getProgress();
  }

  /** Avanzamento corrente, senza modificare la raccolta. */
  getProgress(): CalibrationProgress {
    const open = this.phaseProgress('open', this.openSamples);
    const closed = this.phaseProgress('closed', this.closedSamples);
    const status: CalibrationStatus = this.terminalStatus
      ?? (open.complete && closed.complete
        ? 'ready'
        : this.activePhase !== null
          ? 'collecting'
          : 'idle');

    return Object.freeze({
      status,
      activePhase: this.terminalStatus === null ? this.activePhase : null,
      open,
      closed,
    });
  }

  /**
   * Calcola i riferimenti e restituisce l'esito.
   *
   * Un esito fallito espone comunque campioni, mediane, scostamenti e motivi
   * per occhio, così la UI può spiegare cosa correggere.
   */
  finish(options: CompleteCalibrationOptions): CalibrationOutcome {
    if (
      typeof options !== 'object' ||
      options === null ||
      typeof options.id !== 'string' ||
      options.id.trim().length === 0
    ) {
      throw new CalibrationStateError(
        'Per concludere la calibrazione serve un identificativo non vuoto.',
      );
    }

    if (!Number.isFinite(options.capturedAtMs) || options.capturedAtMs < 0) {
      throw new CalibrationStateError(
        'capturedAtMs deve essere un numero finito e non negativo.',
      );
    }

    const version = options.version?.trim() || DEFAULT_CALIBRATION_VERSION;
    const left = this.buildEyeOutcome('left');
    const right = this.buildEyeOutcome('right');
    const reasons = uniqueReasons([...left.reasons, ...right.reasons]);
    const success = left.success && right.success;
    const status = success ? 'completed' : 'failed';

    let profile: CalibrationProfile | null = null;

    if (success && left.references !== null && right.references !== null) {
      profile = Object.freeze({
        id: options.id,
        version,
        methodVersion: this.methodVersion!,
        capturedAtMs: options.capturedAtMs,
        normalization: 'open-closed-v1' as const,
        eyes: Object.freeze({
          left: left.references,
          right: right.references,
        }),
      });
    }

    this.terminalStatus = status;
    this.activePhase = null;

    return Object.freeze({
      success,
      status,
      profile,
      eyes: Object.freeze({ left, right }),
      reasons,
      completedAtMs: options.capturedAtMs,
    });
  }

  private phaseProgress(
    phase: CalibrationPhase,
    samples: SamplesByEye,
  ): CalibrationPhaseProgress {
    const counts: CountsByEye = {
      left: samples.left.length,
      right: samples.right.length,
    };
    const required = this.config.requiredSamplesPerEye;
    const fraction = Math.min(
      1,
      Math.min(counts.left / required, counts.right / required),
    );

    return Object.freeze({
      phase,
      requiredPerEye: required,
      samples: Object.freeze(counts),
      complete: counts.left >= required && counts.right >= required,
      fraction,
    });
  }

  private buildEyeOutcome(side: EyeSide): CalibrationEyeOutcome {
    const open = this.openSamples[side];
    const closed = this.closedSamples[side];
    const samples = Object.freeze({
      open: open.length,
      closed: closed.length,
    });
    const reasons: CalibrationFailureReason[] = [];
    const enoughOpen = open.length >= this.config.requiredSamplesPerEye;
    const enoughClosed = closed.length >= this.config.requiredSamplesPerEye;

    if (!enoughOpen) {
      reasons.push('not_enough_open_samples');
    }
    if (!enoughClosed) {
      reasons.push('not_enough_closed_samples');
    }

    const openMedian = median(open);
    const closedMedian = median(closed);
    const openDeviation = openMedian === null ? null : maxDeviation(open, openMedian);
    const closedDeviation =
      closedMedian === null ? null : maxDeviation(closed, closedMedian);

    if (
      enoughOpen &&
      openDeviation !== null &&
      openDeviation > this.config.maxReferenceDeviation
    ) {
      reasons.push('unstable_open');
    }

    if (
      enoughClosed &&
      closedDeviation !== null &&
      closedDeviation > this.config.maxReferenceDeviation
    ) {
      reasons.push('unstable_closed');
    }

    if (
      enoughOpen &&
      enoughClosed &&
      openMedian !== null &&
      closedMedian !== null &&
      openMedian - closedMedian < this.config.minimumSeparation
    ) {
      reasons.push('separation_too_small');
    }

    const success =
      reasons.length === 0 && openMedian !== null && closedMedian !== null;
    const references: EyeCalibrationReferences | null = success
      ? Object.freeze({
          open: openMedian,
          closed: closedMedian,
          minimumSeparation: this.config.minimumSeparation,
        })
      : null;

    return Object.freeze({
      side,
      success,
      references,
      samples,
      openMedian,
      closedMedian,
      openDeviation,
      closedDeviation,
      reasons: uniqueReasons(reasons),
    });
  }
}
