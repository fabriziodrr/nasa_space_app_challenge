import type { SessionExport } from '../integration/session-export';
import type { AnnotatedClosure, EventMatchingOptions } from './types';
import { createValidationReport } from './report';
import { summarizeInferencePerformance } from './performance';

/** Senza annotazioni non si inventano falsi positivi, precision o recall. */
export function createSessionValidationReport(data: SessionExport, annotations?: readonly AnnotatedClosure[], matching?: EventMatchingOptions) {
  return {
    reportVersion: 'n05-session-v1' as const,
    source: data.source,
    sessionSchemaVersion: data.schemaVersion,
    application: data.application,
    calibration: data.calibration,
    inference: data.inference,
    engineConfig: data.snapshot.config,
    engineVersion: data.snapshot.engineVersion,
    engineSchemaVersion: data.snapshot.schemaVersion,
    calibrationIds: data.snapshot.calibrationIds,
    session: data.snapshot.session,
    timeOriginUnixMs: data.timeOriginUnixMs,
    performance: data.source.kind === 'webcam' ? summarizeInferencePerformance(data.performanceSamples) : null,
    annotations: annotations ?? null,
    matchingOptions: annotations === undefined ? null : {
      minIou: matching?.minIou ?? 0.5,
      startToleranceMs: matching?.startToleranceMs ?? 100,
      endToleranceMs: matching?.endToleranceMs ?? 100,
    },
    comparison: annotations === undefined ? null : createValidationReport({
      annotations, snapshot: data.snapshot, ...(data.source.kind === 'webcam' ? { performanceSamples: data.performanceSamples } : {}), matching,
    }),
  };
}
