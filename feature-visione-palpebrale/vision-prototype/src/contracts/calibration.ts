import type { EyeSide } from './sample';

/** Fase di raccolta guidata dalla UI. */
export type CalibrationPhase = 'open' | 'closed';

/** Stato complessivo della calibrazione. */
export type CalibrationStatus =
  | 'idle'
  | 'collecting'
  | 'ready'
  | 'completed'
  | 'failed';

/**
 * Motivo per cui una calibrazione non produce riferimenti utilizzabili.
 *
 * I motivi sono per occhio e vengono aggregati nell'esito complessivo.
 */
export type CalibrationEyeFailureReason =
  | 'not_enough_open_samples'
  | 'not_enough_closed_samples'
  | 'unstable_open'
  | 'unstable_closed'
  | 'separation_too_small';

export interface CalibrationConfigValues {
  /** Valid samples richiesti per ciascun occhio in ciascuna fase. */
  readonly requiredSamplesPerEye: number;
  /** Scostamento massimo ammesso dal valore mediano di riferimento. */
  readonly maxReferenceDeviation: number;
  /** Differenza minima fra riferimento aperto e chiuso. */
  readonly minimumSeparation: number;
}

export interface CalibrationConfigInput {
  readonly requiredSamplesPerEye?: number;
  readonly maxReferenceDeviation?: number;
  readonly minimumSeparation?: number;
}

/** Configurazione validata della calibrazione. */
export interface ResolvedCalibrationConfig extends CalibrationConfigValues {
  readonly configId: string;
}

/**
 * Riferimenti grezzi raccolti per un occhio durante la calibrazione.
 *
 * I valori appartengono alla geometria definita in N03, prima della
 * normalizzazione usata dal motore temporale. `minimumSeparation` è la
 * distanza minima richiesta tra riferimento aperto e chiuso nella stessa unità.
 */
export interface EyeCalibrationReferences {
  readonly open: number;
  readonly closed: number;
  readonly minimumSeparation: number;
}

/**
 * Calibration utilizzabile dal motore.
 *
 * La versione identifica formula e procedura; l'identificativo distingue una
 * specifica raccolta di riferimenti. Il motore temporale usa soltanto `id` per
 * verificare la continuità, mentre i riferimenti completi servono a
 * riprodurre la normalizzazione dei campioni.
 */
export interface CalibrationProfile {
  readonly id: string;
  readonly version: string;
  /** Versione della geometria con cui sono stati raccolti i riferimenti. */
  readonly methodVersion: string;
  /** Data di raccolta UTC, in millisecondi Unix; non è un tempo del motore. */
  readonly capturedAtMs: number;
  readonly normalization: 'open-closed-v1';
  readonly eyes: Readonly<Record<EyeSide, EyeCalibrationReferences>>;
}

export type CalibrationFailureReason =
  | 'insufficient_samples'
  | 'insufficient_separation'
  | 'invalid_geometry'
  | 'unstable_reference'
  | 'interrupted';

/** Stato esposto da N03 alla UI; i conteggi si riferiscono al riferimento corrente. */
export type CalibrationState =
  | { readonly status: 'idle' }
  | {
      readonly status: 'collecting';
      readonly reference: 'open' | 'closed';
      readonly acceptedSamples: Readonly<Record<EyeSide, number>>;
      readonly requiredSamplesPerEye: number;
    }
  | { readonly status: 'ready'; readonly profile: CalibrationProfile }
  | {
      readonly status: 'insufficient';
      readonly reasons: readonly [CalibrationFailureReason, ...CalibrationFailureReason[]];
      readonly details?: readonly CalibrationEyeFailureReason[];
    };

export interface CalibrationPhaseProgress {
  readonly phase: CalibrationPhase;
  readonly requiredPerEye: number;
  readonly samples: Readonly<Record<EyeSide, number>>;
  readonly complete: boolean;
  /** Avanzamento 0–1 limitato al minimo fra i due occhi. */
  readonly fraction: number;
}

/** Progresso consumabile dalle schermate di T04. */
export interface CalibrationProgress {
  readonly status: CalibrationStatus;
  readonly activePhase: CalibrationPhase | null;
  readonly open: CalibrationPhaseProgress;
  readonly closed: CalibrationPhaseProgress;
}

/** Esito della calibrazione per un singolo occhio. */
export interface CalibrationEyeOutcome {
  readonly side: EyeSide;
  readonly success: boolean;
  readonly references: EyeCalibrationReferences | null;
  readonly samples: Readonly<Record<CalibrationPhase, number>>;
  readonly openMedian: number | null;
  readonly closedMedian: number | null;
  readonly openDeviation: number | null;
  readonly closedDeviation: number | null;
  readonly reasons: readonly CalibrationEyeFailureReason[];
}

/**
 * Esito completo.
 *
 * `profile` è presente solo se entrambi gli occhi hanno riferimenti validi.
 * In caso di fallimento `reasons` contiene l'unione dei motivi dei due occhi,
 * senza duplicati.
 */
export interface CalibrationOutcome {
  readonly success: boolean;
  readonly status: 'completed' | 'failed';
  readonly profile: CalibrationProfile | null;
  readonly eyes: Readonly<Record<EyeSide, CalibrationEyeOutcome>>;
  readonly reasons: readonly CalibrationEyeFailureReason[];
  readonly completedAtMs: number;
}

export interface CompleteCalibrationOptions {
  readonly id: string;
  /** Data UTC in millisecondi Unix, fornita dall'applicazione. */
  readonly capturedAtMs: number;
  readonly version?: string;
}
