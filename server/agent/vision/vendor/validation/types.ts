import type { ClosureEvent, EngineSnapshot } from '../contracts/engine';

/**
 * Origine dell'annotazione manuale.
 *
 * Le prove sintetiche non vanno presentate come accuratezza su persone reali.
 */
export type AnnotationSource =
  | 'fixture'
  | 'controlled'
  | 'voluntary'
  | 'spontaneous';

/** Intervallo di chiusura bilaterale atteso, fornito da annotazione manuale. */
export interface AnnotatedClosure {
  readonly id: string;
  readonly startMs: number;
  readonly endMs: number;
  /** `undefined` quando l'annotatore non ha valutato la completezza. */
  readonly complete?: boolean;
  readonly source?: AnnotationSource;
  readonly notes?: string;
}

export interface EventMatchingOptions {
  /** Soglia minima di intersezione su unione. Predefinita: 0.5. */
  readonly minIou?: number;
  /** Tolleranza sull'inizio usata in alternativa alla soglia IoU. Predefinita: 100 ms. */
  readonly startToleranceMs?: number;
  /** Tolleranza sulla fine usata in alternativa alla soglia IoU. Predefinita: 100 ms. */
  readonly endToleranceMs?: number;
}

export interface MatchedClosure {
  readonly annotationId: string;
  readonly predictedId: string;
  readonly iou: number;
  /** `predicted.start - annotation.start`; positivo se il motore è in ritardo. */
  readonly startErrorMs: number;
  /** `predicted.end - annotation.end`; positivo se il motore chiude tardi. */
  readonly endErrorMs: number;
  /** `predicted.duration - annotation.duration`. */
  readonly durationErrorMs: number;
  readonly completenessMatches: boolean | null;
}

export interface EventMatchingResult {
  readonly annotationsCount: number;
  readonly predictionsCount: number;
  readonly truePositiveCount: number;
  readonly falseNegativeCount: number;
  readonly falsePositiveCount: number;
  readonly precision: number | null;
  readonly recall: number | null;
  readonly f1: number | null;
  readonly completenessMismatchCount: number;
  readonly meanAbsoluteStartErrorMs: number | null;
  readonly meanAbsoluteEndErrorMs: number | null;
  readonly meanAbsoluteDurationErrorMs: number | null;
  readonly matched: readonly MatchedClosure[];
  readonly falseNegatives: readonly AnnotatedClosure[];
  readonly falsePositives: readonly ClosureEvent[];
}

/** Una misura di latenza associata al timestamp del frame elaborato. */
export interface InferencePerformanceSample {
  readonly timestampMs: number;
  readonly inferenceMs: number;
}

export interface InferencePerformanceSummary {
  readonly count: number;
  readonly intervalMs: number;
  /** Frequenza stimata dal numero di intervalli e dal tempo trascorso. */
  readonly framesPerSecond: number | null;
  readonly meanInferenceMs: number | null;
  readonly minInferenceMs: number | null;
  readonly maxInferenceMs: number | null;
  readonly p50InferenceMs: number | null;
  readonly p95InferenceMs: number | null;
}

export interface ValidationReportInput {
  readonly annotations: readonly AnnotatedClosure[];
  readonly snapshot: EngineSnapshot;
  readonly performanceSamples?: readonly InferencePerformanceSample[];
  readonly matching?: EventMatchingOptions;
}

export interface ValidationReportSession {
  readonly elapsedMs: number;
  readonly validMs: number;
  readonly coverage: number | null;
  readonly closedMs: number;
  readonly closureFraction: number | null;
  readonly completeClosureCount: number;
  readonly incompleteClosureCount: number;
  readonly prolongedClosureCount: number;
  readonly longestCompleteMs: number | null;
}

export interface ValidationReport {
  readonly reportVersion: 'n05-report-v1';
  readonly annotationsCount: number;
  readonly predictionsCount: number;
  readonly matching: EventMatchingResult;
  readonly session: ValidationReportSession;
  readonly performance: InferencePerformanceSummary | null;
  readonly engine: {
    readonly schemaVersion: string;
    readonly engineVersion: string;
    readonly configId: string;
    readonly calibrationIds: readonly string[];
  };
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
