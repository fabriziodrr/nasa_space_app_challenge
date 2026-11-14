import { TemporalEngine } from '../src/analysis/engine';
import type { AnalysisSample, CalibrationProfile } from '../src/contracts';

/** Riferimenti inventati per verificare il contratto: non sono una calibrazione reale. */
export const exampleCalibration: CalibrationProfile = {
  id: 'c01-example-calibration',
  version: 'synthetic-calibration-v1',
  methodVersion: 'synthetic-ear-v1',
  capturedAtMs: 0,
  normalization: 'open-closed-v1',
  eyes: {
    left: { open: 0.3, closed: 0.1, minimumSeparation: 0.05 },
    right: { open: 0.3, closed: 0.1, minimumSeparation: 0.05 },
  },
};

export const exampleValidSample: AnalysisSample = {
  timestampMs: 100,
  calibrationId: exampleCalibration.id,
  left: { validity: 'valid', openness: 0 },
  right: { validity: 'valid', openness: 0 },
};

export const exampleInvalidSample: AnalysisSample = {
  timestampMs: 200,
  calibrationId: exampleCalibration.id,
  left: { validity: 'invalid', reasons: ['not_tracked'] },
  right: { validity: 'invalid', reasons: ['not_tracked'] },
};

/** Gli esempi di risultato sono generati dal motore, senza duplicarne i calcoli. */
export function createContractExamples() {
  const open = (timestampMs: number): AnalysisSample => ({
    timestampMs, calibrationId: exampleCalibration.id,
    left: { validity: 'valid', openness: 1 },
    right: { validity: 'valid', openness: 1 },
  });
  const run = (samples: readonly AnalysisSample[]) => {
    const engine = new TemporalEngine();
    engine.start();
    for (const sample of samples) engine.processSample(sample);
    engine.stop();
    return engine.getSnapshot();
  };
  const complete = run([open(0), exampleValidSample, { ...exampleValidSample, timestampMs: 200 }, open(300)]);
  const incomplete = run([open(0), exampleValidSample, exampleInvalidSample]);
  const unavailable = run([{ ...exampleInvalidSample, timestampMs: 0 }, exampleInvalidSample]);

  return { calibration: exampleCalibration, validSample: exampleValidSample, invalidSample: exampleInvalidSample,
    complete, incomplete, unavailable };
}
