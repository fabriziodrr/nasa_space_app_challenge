import type { EyeSide } from './sample';

/** Stato del motore fra una sessione e l'altra. */
export type EngineStatus = 'idle' | 'running' | 'stopped';

/** Stato di un singolo occhio dopo l'isteresi. */
export type EyeState = 'unknown' | 'open' | 'closed';

/**
 * Stato bilaterale derivato dai due occhi.
 *
 * `mixed` indica che un occhio è aperto e l'altro chiuso: è un occhiolino, non
 * una chiusura bilaterale. `unknown` indica che almeno un occhio non è
 * valutabile.
 */
export type BilateralState = 'unknown' | 'open' | 'mixed' | 'closed';

/** Tipo di episodio di chiusura prodotto dal motore. */
export type ClosureKind = 'bilateral' | EyeSide;

/**
 * Causa della fine di un episodio.
 *
 * Solo `reopened` produce un episodio completo. Le altre cause chiudono
 * l'episodio come incompleto perché il dato manca o la continuità si interrompe.
 */
export type ClosureEndReason =
  | 'reopened'
  | 'tracking_lost'
  | 'gap'
  | 'calibration_changed'
  | 'stopped';

/** Motivo per cui un campione non entra nella misura. */
export type SampleRejectionReason =
  | 'invalid_timestamp'
  | 'duplicate_timestamp'
  | 'out_of_order_timestamp'
  | 'invalid_calibration_id'
  | 'invalid_eye_observation';

/**
 * Valori di configurazione richiesti dal motore.
 *
 * I valori iniziali sono sperimentali e vanno motivati nel collaudo.
 * `closedEnter` deve essere minore di `openExit`; i valori di apertura sono
 * normalizzati con 0 = chiuso e 1 = aperto.
 */
export interface EngineConfigValues {
  readonly closedEnter: number;
  readonly openExit: number;
  readonly maxGapMs: number;
  readonly rollingWindowMs: number;
  readonly prolongedClosureMs: number;
}

export interface EngineConfigInput {
  readonly version?: string;
  readonly closedEnter?: number;
  readonly openExit?: number;
  readonly maxGapMs?: number;
  readonly rollingWindowMs?: number;
  readonly prolongedClosureMs?: number;
}

/**
 * Configurazione validata e identificata.
 *
 * `configId` deriva dai valori effettivamente usati: due configurazioni con
 * valori diversi hanno identificativi diversi anche se condividono `version`.
 */
export interface ResolvedEngineConfig extends EngineConfigValues {
  readonly version: string;
  readonly configId: string;
}

export interface SampleRejection {
  readonly timestampMs: number | null;
  readonly reason: SampleRejectionReason;
  readonly message: string;
}

export interface SampleAccepted {
  readonly status: 'accepted';
  readonly timestampMs: number;
  readonly intervalMs: number;
  readonly gap: boolean;
  readonly calibrationChanged: boolean;
}

export interface SampleRejected {
  readonly status: 'rejected';
  readonly timestampMs: number | null;
  readonly reason: SampleRejectionReason;
  readonly message: string;
}

export type ProcessSampleResult = SampleAccepted | SampleRejected;

/**
 * Episodio di chiusura.
 *
 * `startedAtMs` è sempre l'istante della prima osservazione chiusa.
 * `endedAtMs` è `null` finché l'episodio è in corso. `durationMs` è la durata
 * osservata: per un episodio in corso misura fino all'ultimo campione.
 * `complete` è vero solo se l'occhio (o la coppia) si è riaperto con continuità.
 * `prolonged` considera solo episodi completi.
 */
export interface ClosureEvent {
  readonly id: string;
  readonly kind: ClosureKind;
  readonly startedAtMs: number;
  readonly endedAtMs: number | null;
  readonly durationMs: number;
  readonly complete: boolean;
  readonly endedReason: ClosureEndReason | null;
  readonly prolonged: boolean;
}

/**
 * Episodio visto attraverso una finestra mobile.
 *
 * `durationMs` resta la durata reale dell'episodio; `windowOverlapMs` è la sola
 * parte dentro la finestra. Un episodio tagliato dal bordo ha
 * `completeWithinWindow: false` e non viene contato tra le chiusure complete
 * più brevi.
 */
export interface WindowClosureEvent extends ClosureEvent {
  readonly windowOverlapMs: number;
  readonly completeWithinWindow: boolean;
  readonly truncatedAtStart: boolean;
  readonly truncatedAtEnd: boolean;
}

export interface ClosureStats {
  readonly episodeCount: number;
  readonly completeCount: number;
  readonly incompleteCount: number;
  readonly prolongedCount: number;
  readonly longestCompleteMs: number | null;
  readonly longestObservedMs: number | null;
}

/** Aggregati temporali di un singolo occhio. */
export interface EyeScopeSnapshot {
  readonly validMs: number;
  readonly closedMs: number;
  readonly openMs: number;
  readonly coverage: number | null;
  readonly closureFraction: number | null;
  readonly closures: ClosureStats;
}

/**
 * Aggregati di sessione o di finestra mobile.
 *
 * I tempi bilateralI richiedono che entrambi gli occhi siano valutabili.
 * `validMs` è il tempo bilaterale valido; `closedMs` è il tempo con entrambi gli
 * occhi chiusi. `coverage` è `validMs / elapsedMs`, `closureFraction` è
 * `closedMs / validMs`. Entrambi valgono `null` se il denominatore è zero.
 */
export interface ScopeSnapshot<
  TEvent extends ClosureEvent = ClosureEvent,
> {
  readonly startMs: number | null;
  readonly endMs: number | null;
  readonly elapsedMs: number;
  readonly validMs: number;
  readonly closedMs: number;
  readonly openMs: number;
  readonly unknownMs: number;
  readonly coverage: number | null;
  readonly closureFraction: number | null;
  readonly gapMs: number;
  readonly calibrationTransitionMs: number;
  readonly closures: ClosureStats;
  readonly left: EyeScopeSnapshot;
  readonly right: EyeScopeSnapshot;
  readonly events: readonly TEvent[];
}

export type SessionSnapshot = ScopeSnapshot<ClosureEvent>;
export type WindowSnapshot = ScopeSnapshot<WindowClosureEvent>;

export interface EyeReading {
  readonly state: EyeState;
  readonly openness: number | null;
  readonly valid: boolean;
}

export interface CurrentReadings {
  readonly timestampMs: number | null;
  readonly calibrationId: string | null;
  readonly left: EyeReading;
  readonly right: EyeReading;
  readonly bilateral: BilateralState;
  readonly active: {
    readonly left: ClosureEvent | null;
    readonly right: ClosureEvent | null;
    readonly bilateral: ClosureEvent | null;
  };
}

export interface EngineDiagnostics {
  readonly acceptedSamples: number;
  readonly rejectedSamples: number;
  readonly rejections: readonly SampleRejection[];
  readonly calibrationChanges: number;
}

/**
 * Istantanea immutabile consumata da UI, replay ed esportazione.
 *
 * Il motore è l'unico responsabile di durate, copertura e quote: i consumatori
 * non devono ricalcolarle.
 */
export interface EngineSnapshot {
  readonly schemaVersion: 'n02-snapshot-v1';
  readonly engineVersion: 'n02-engine-v1';
  readonly status: EngineStatus;
  readonly config: ResolvedEngineConfig;
  readonly calibrationIds: readonly string[];
  readonly diagnostics: EngineDiagnostics;
  readonly session: SessionSnapshot;
  readonly window: WindowSnapshot;
  readonly current: CurrentReadings;
}
