import type { ClosureEvent } from '../contracts/engine';
import type {
  AnnotatedClosure,
  EventMatchingOptions,
  EventMatchingResult,
  MatchedClosure,
} from './types';
import { ValidationError } from './types';

const DEFAULT_MIN_IOU = 0.5;
const DEFAULT_START_TOLERANCE_MS = 100;
const DEFAULT_END_TOLERANCE_MS = 100;

interface Interval {
  readonly startMs: number;
  readonly endMs: number;
  readonly durationMs: number;
}

interface Candidate {
  readonly annotationIndex: number;
  readonly predictionIndex: number;
  readonly iou: number;
  readonly startErrorMs: number;
  readonly endErrorMs: number;
  readonly durationErrorMs: number;
  readonly completenessMatches: boolean | null;
}

function interval(startMs: number, endMs: number, label: string): Interval {
  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    startMs < 0 ||
    endMs < startMs
  ) {
    throw new ValidationError(`${label}: intervallo non valido.`);
  }

  return { startMs, endMs, durationMs: endMs - startMs };
}

function annotationInterval(annotation: AnnotatedClosure): Interval {
  if (typeof annotation.id !== 'string' || annotation.id.trim().length === 0) {
    throw new ValidationError('Ogni annotazione deve avere un identificativo.');
  }

  return interval(annotation.startMs, annotation.endMs, `annotazione ${annotation.id}`);
}

function predictionInterval(event: ClosureEvent): Interval {
  const endMs = event.endedAtMs ?? event.startedAtMs + event.durationMs;
  return interval(event.startedAtMs, endMs, `evento ${event.id}`);
}

function intersection(a: Interval, b: Interval): number {
  return Math.max(0, Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs));
}

function union(a: Interval, b: Interval): number {
  return Math.max(a.endMs, b.endMs) - Math.min(a.startMs, b.startMs);
}

function iou(a: Interval, b: Interval): number {
  const overlap = intersection(a, b);
  const total = union(a, b);
  return total > 0 ? overlap / total : 0;
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function resolveOptions(options: EventMatchingOptions = {}) {
  const minIou = options.minIou ?? DEFAULT_MIN_IOU;
  const startToleranceMs = options.startToleranceMs ?? DEFAULT_START_TOLERANCE_MS;
  const endToleranceMs = options.endToleranceMs ?? DEFAULT_END_TOLERANCE_MS;

  if (!Number.isFinite(minIou) || minIou < 0 || minIou > 1) {
    throw new ValidationError('minIou deve essere compreso tra 0 e 1.');
  }
  if (!Number.isFinite(startToleranceMs) || startToleranceMs < 0) {
    throw new ValidationError('startToleranceMs deve essere non negativo.');
  }
  if (!Number.isFinite(endToleranceMs) || endToleranceMs < 0) {
    throw new ValidationError('endToleranceMs deve essere non negativo.');
  }

  return { minIou, startToleranceMs, endToleranceMs };
}

/**
 * Confronta chiusure annotate e chiusure bilaterali prodotte dal motore.
 *
 * L'abbinamento è uno-a-uno e deterministico: prima gli IoU più alti, poi gli
 * errori di inizio/fine più piccoli. Un evento è candidato se supera `minIou`
 * oppure se inizio e fine rientrano nelle tolleranze.
 */
export function matchClosureEvents(
  annotations: readonly AnnotatedClosure[],
  predictions: readonly ClosureEvent[],
  options: EventMatchingOptions = {},
): EventMatchingResult {
  const resolved = resolveOptions(options);
  const annotationInvs = annotations.map(annotationInterval);
  const predictionInvs = predictions.map(predictionInterval);

  const candidates: Candidate[] = [];

  for (let annotationIndex = 0; annotationIndex < annotations.length; annotationIndex += 1) {
    const annotation = annotations[annotationIndex];
    const annotationInv = annotationInvs[annotationIndex];

    if (annotation === undefined || annotationInv === undefined) {
      continue;
    }

    for (let predictionIndex = 0; predictionIndex < predictions.length; predictionIndex += 1) {
      const prediction = predictions[predictionIndex];
      const predictionInv = predictionInvs[predictionIndex];

      if (prediction === undefined || predictionInv === undefined) {
        continue;
      }

      const overlapIou = iou(annotationInv, predictionInv);
      const startErrorMs = predictionInv.startMs - annotationInv.startMs;
      const endErrorMs = predictionInv.endMs - annotationInv.endMs;

      const withinTolerance =
        Math.abs(startErrorMs) <= resolved.startToleranceMs &&
        Math.abs(endErrorMs) <= resolved.endToleranceMs;

      if (overlapIou < resolved.minIou && !withinTolerance) {
        continue;
      }

      candidates.push({
        annotationIndex,
        predictionIndex,
        iou: overlapIou,
        startErrorMs,
        endErrorMs,
        durationErrorMs: predictionInv.durationMs - annotationInv.durationMs,
        completenessMatches:
          annotation.complete === undefined
            ? null
            : annotation.complete === prediction.complete,
      });
    }
  }

  candidates.sort(
    (left, right) =>
      right.iou - left.iou ||
      Math.abs(left.startErrorMs) - Math.abs(right.startErrorMs) ||
      Math.abs(left.endErrorMs) - Math.abs(right.endErrorMs) ||
      left.annotationIndex - right.annotationIndex ||
      left.predictionIndex - right.predictionIndex,
  );

  const usedAnnotations = new Set<number>();
  const usedPredictions = new Set<number>();
  const matched: MatchedClosure[] = [];

  for (const candidate of candidates) {
    if (
      usedAnnotations.has(candidate.annotationIndex) ||
      usedPredictions.has(candidate.predictionIndex)
    ) {
      continue;
    }

    const annotation = annotations[candidate.annotationIndex];
    const prediction = predictions[candidate.predictionIndex];

    if (annotation === undefined || prediction === undefined) {
      continue;
    }

    usedAnnotations.add(candidate.annotationIndex);
    usedPredictions.add(candidate.predictionIndex);
    matched.push(
      Object.freeze({
        annotationId: annotation.id,
        predictedId: prediction.id,
        iou: candidate.iou,
        startErrorMs: candidate.startErrorMs,
        endErrorMs: candidate.endErrorMs,
        durationErrorMs: candidate.durationErrorMs,
        completenessMatches: candidate.completenessMatches,
      }),
    );
  }

  const falseNegatives = annotations.filter(
    (_annotation, index) => !usedAnnotations.has(index),
  );
  const falsePositives = predictions.filter(
    (_prediction, index) => !usedPredictions.has(index),
  );
  const truePositiveCount = matched.length;
  const falseNegativeCount = falseNegatives.length;
  const falsePositiveCount = falsePositives.length;
  const precision = ratio(truePositiveCount, truePositiveCount + falsePositiveCount);
  const recall = ratio(truePositiveCount, truePositiveCount + falseNegativeCount);
  const f1 =
    precision === null || recall === null || precision + recall === 0
      ? null
      : (2 * precision * recall) / (precision + recall);

  return Object.freeze({
    annotationsCount: annotations.length,
    predictionsCount: predictions.length,
    truePositiveCount,
    falseNegativeCount,
    falsePositiveCount,
    precision,
    recall,
    f1,
    completenessMismatchCount: matched.filter(
      (event) => event.completenessMatches === false,
    ).length,
    meanAbsoluteStartErrorMs:
      mean(matched.map((event) => Math.abs(event.startErrorMs))),
    meanAbsoluteEndErrorMs:
      mean(matched.map((event) => Math.abs(event.endErrorMs))),
    meanAbsoluteDurationErrorMs:
      mean(matched.map((event) => Math.abs(event.durationErrorMs))),
    matched: Object.freeze(matched),
    falseNegatives: Object.freeze([...falseNegatives]),
    falsePositives: Object.freeze([...falsePositives]),
  });
}
