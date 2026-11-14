/** Lato dell'occhio usato da campioni, eventi e aggregati. */
export type EyeSide = 'left' | 'right';

/**
 * Motivo per cui un occhio non è valutabile in un campione.
 * I codici sono stabili nel contratto; i messaggi per l'interfaccia vengono
 * composti a partire da questi valori.
 */
export const EYE_INVALIDITY_REASONS = Object.freeze([
  'not_tracked', 'landmark_missing', 'low_confidence', 'geometry_invalid',
  'out_of_range', 'ambiguous_face', 'uncalibrated', 'unknown',
] as const);
export type EyeInvalidityReason = typeof EYE_INVALIDITY_REASONS[number];

/**
 * Misura calibrata di un occhio.
 *
 * `openness` è normalizzata rispetto ai riferimenti di calibrazione:
 * 0 corrisponde al riferimento chiuso, 1 al riferimento aperto.
 * Il valore è finito; può uscire da [0, 1] per rumore o movimento e non viene
 * tagliato dal motore. Un occhio non valutabile non ha un valore numerico.
 */
export type EyeObservation =
  | {
      readonly validity: 'valid';
      readonly openness: number;
    }
  | {
      readonly validity: 'invalid';
      readonly reasons: readonly [EyeInvalidityReason, ...EyeInvalidityReason[]];
    };

/**
 * Campione in ingresso al motore temporale.
 *
 * `timestampMs` è un tempo monotono in millisecondi, con la stessa origine per
 * tutti i campioni della sessione. Due campioni con lo stesso timestamp o con
 * timestamp decrescente vengono rifiutati dal motore.
 *
 * `calibrationId` identifica la calibrazione usata per produrre `openness`.
 * Un cambio di identificativo interrompe la continuità della misura.
 */
export interface AnalysisSample {
  readonly timestampMs: number;
  readonly calibrationId: string;
  readonly left: EyeObservation;
  readonly right: EyeObservation;
}
