import type {
  InferencePerformanceSample,
  InferencePerformanceSummary,
} from './types';
import { ValidationError } from './types';

function percentile(sorted: readonly number[], fraction: number): number | null {
  if (sorted.length === 0) {
    return null;
  }

  if (sorted.length === 1) {
    return sorted[0] ?? null;
  }

  const rank = Math.max(0, Math.min(1, fraction)) * (sorted.length - 1);
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);
  const lower = sorted[lowerIndex];
  const upper = sorted[upperIndex];

  if (lower === undefined || upper === undefined) {
    return null;
  }

  if (lowerIndex === upperIndex) {
    return lower;
  }

  const weight = rank - lowerIndex;
  return lower * (1 - weight) + upper * weight;
}

/**
 * Riepiloga latenze di inferenza e frequenza stimata dai timestamp dei frame.
 *
 * La frequenza usa `(count - 1) / intervallo`: misura il passo dei frame
 * elaborati, non il frame rate dichiarato dalla fotocamera.
 */
export function summarizeInferencePerformance(
  samples: readonly InferencePerformanceSample[],
): InferencePerformanceSummary {
  if (samples.length === 0) {
    return Object.freeze({
      count: 0,
      intervalMs: 0,
      framesPerSecond: null,
      meanInferenceMs: null,
      minInferenceMs: null,
      maxInferenceMs: null,
      p50InferenceMs: null,
      p95InferenceMs: null,
    });
  }

  let firstTimestampMs: number | null = null;
  let lastTimestampMs: number | null = null;
  let previousTimestampMs = -Infinity;
  let totalMs = 0;
  const latencies: number[] = [];

  for (const sample of samples) {
    if (
      !Number.isFinite(sample.timestampMs) ||
      sample.timestampMs < 0 ||
      !Number.isFinite(sample.inferenceMs) ||
      sample.inferenceMs < 0
    ) {
      throw new ValidationError(
        'I campioni di prestazione devono avere timestamp e latenze finiti e non negativi.',
      );
    }

    if (sample.timestampMs < previousTimestampMs) {
      throw new ValidationError(
        'I timestamp dei campioni di prestazione devono essere non decrescenti.',
      );
    }

    firstTimestampMs ??= sample.timestampMs;
    lastTimestampMs = sample.timestampMs;
    previousTimestampMs = sample.timestampMs;
    totalMs += sample.inferenceMs;
    latencies.push(sample.inferenceMs);
  }

  const intervalMs =
    firstTimestampMs === null || lastTimestampMs === null
      ? 0
      : Math.max(0, lastTimestampMs - firstTimestampMs);
  const sorted = [...latencies].sort((left, right) => left - right);
  const count = samples.length;

  return Object.freeze({
    count,
    intervalMs,
    framesPerSecond:
      count > 1 && intervalMs > 0 ? ((count - 1) * 1000) / intervalMs : null,
    meanInferenceMs: totalMs / count,
    minInferenceMs: sorted[0] ?? null,
    maxInferenceMs: sorted[sorted.length - 1] ?? null,
    p50InferenceMs: percentile(sorted, 0.5),
    p95InferenceMs: percentile(sorted, 0.95),
  });
}

/**
 * Misura una singola operazione con un orologio iniettato.
 *
 * In T04 si passa `performance.now`; nei test si usa un orologio finto, così
 * la misura resta deterministica e non dipende dal sistema.
 */
export function measureInference<T>(
  operation: () => T,
  now: () => number,
): { readonly value: T; readonly inferenceMs: number } {
  const startedAtMs = now();
  const value = operation();
  const finishedAtMs = now();

  if (
    !Number.isFinite(startedAtMs) ||
    !Number.isFinite(finishedAtMs) ||
    finishedAtMs < startedAtMs
  ) {
    throw new ValidationError('L’orologio di misura ha restituito tempi non validi.');
  }

  return Object.freeze({ value, inferenceMs: finishedAtMs - startedAtMs });
}
