import { describe, expect, it } from 'vitest';
import { TemporalEngine } from '../../src/analysis/engine';
import { stateSample } from '../../fixtures/support';
import { createValidationReport } from '../../src/validation/report';

function controlledSnapshot() {
  const engine = new TemporalEngine();
  engine.start();
  for (const sample of [
    stateSample(0, 0.9, 0.9),
    stateSample(100, 0.1, 0.1),
    stateSample(200, 0.1, 0.1),
    stateSample(300, 0.9, 0.9),
  ]) {
    engine.processSample(sample);
  }
  engine.stop();
  return engine.getSnapshot();
}

describe('N05: report di validazione', () => {
  it('legge le metriche del motore senza ricalcolarle', () => {
    const snapshot = controlledSnapshot();
    const report = createValidationReport({
      annotations: [{ id: 'a', startMs: 100, endMs: 300, complete: true }],
      snapshot,
      performanceSamples: [
        { timestampMs: 0, inferenceMs: 5 },
        { timestampMs: 100, inferenceMs: 7 },
        { timestampMs: 200, inferenceMs: 6 },
        { timestampMs: 300, inferenceMs: 8 },
      ],
    });

    expect(report.reportVersion).toBe('n05-report-v1');
    expect(report.matching).toMatchObject({
      truePositiveCount: 1,
      falsePositiveCount: 0,
      falseNegativeCount: 0,
      precision: 1,
      recall: 1,
      f1: 1,
    });
    expect(report.session).toMatchObject({
      elapsedMs: 300,
      validMs: 300,
      coverage: 1,
      closedMs: 200,
      closureFraction: 2 / 3,
      completeClosureCount: 1,
      incompleteClosureCount: 0,
      prolongedClosureCount: 0,
      longestCompleteMs: 200,
    });
    expect(report.performance).toMatchObject({
      count: 4,
      intervalMs: 300,
      framesPerSecond: 10,
      meanInferenceMs: 6.5,
    });
    expect(report.engine).toMatchObject({
      schemaVersion: 'n02-snapshot-v1',
      engineVersion: 'n02-engine-v1',
      calibrationIds: ['cal-a'],
    });
  });

  it('restituisce performance null se non vengono forniti campioni', () => {
    const report = createValidationReport({
      annotations: [],
      snapshot: controlledSnapshot(),
    });

    expect(report.performance).toBeNull();
    expect(report.predictionsCount).toBe(1);
    expect(report.matching.falsePositiveCount).toBe(1);
  });
});
