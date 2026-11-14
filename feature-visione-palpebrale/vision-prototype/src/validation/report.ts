import { matchClosureEvents } from './events';
import { summarizeInferencePerformance } from './performance';
import type {
  ValidationReport,
  ValidationReportInput,
} from './types';

/**
 * Costruisce un riepilogo N05 senza ricalcolare le metriche del motore.
 *
 * Il confronto riguarda le chiusure bilaterali. Copertura, quota di chiusura e
 * statistiche degli episodi sono lette direttamente da `EngineSnapshot`.
 */
export function createValidationReport(
  input: ValidationReportInput,
): ValidationReport {
  const predictions = input.snapshot.session.events.filter(
    (event) => event.kind === 'bilateral',
  );
  const matching = matchClosureEvents(
    input.annotations,
    predictions,
    input.matching,
  );
  const session = input.snapshot.session;

  return Object.freeze({
    reportVersion: 'n05-report-v1' as const,
    annotationsCount: input.annotations.length,
    predictionsCount: predictions.length,
    matching,
    session: Object.freeze({
      elapsedMs: session.elapsedMs,
      validMs: session.validMs,
      coverage: session.coverage,
      closedMs: session.closedMs,
      closureFraction: session.closureFraction,
      completeClosureCount: session.closures.completeCount,
      incompleteClosureCount: session.closures.incompleteCount,
      prolongedClosureCount: session.closures.prolongedCount,
      longestCompleteMs: session.closures.longestCompleteMs,
    }),
    performance:
      input.performanceSamples === undefined
        ? null
        : summarizeInferencePerformance(input.performanceSamples),
    engine: Object.freeze({
      schemaVersion: input.snapshot.schemaVersion,
      engineVersion: input.snapshot.engineVersion,
      configId: input.snapshot.config.configId,
      calibrationIds: Object.freeze([...input.snapshot.calibrationIds]),
    }),
  });
}
