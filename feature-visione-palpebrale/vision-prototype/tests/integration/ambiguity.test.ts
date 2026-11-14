import { describe, expect, it } from 'vitest';
import { convertFaceLandmarkerResult } from '../../src/inference/convert';
import { toAnalysisSample } from '../../src/analysis/calibration';
import { TemporalEngine } from '../../src/analysis/engine';
import { EYE_INVALIDITY_REASONS } from '../../src/contracts/sample';
import { exampleCalibration } from '../../fixtures/contract-examples';

describe('volti ambigui attraverso la pipeline', () => {
  it('accetta ogni motivo del contratto come dato invalido', () => {
    for (const reason of EYE_INVALIDITY_REASONS) {
      const engine = new TemporalEngine(); engine.start();
      const result = engine.processSample({ timestampMs: 0, calibrationId: 'cal',
        left: { validity: 'invalid', reasons: [reason] }, right: { validity: 'invalid', reasons: [reason] } });
      expect(result.status).toBe('accepted');
      expect(engine.getSnapshot().current.bilateral).toBe('unknown');
    }
  });

  it('con più volti interrompe la chiusura e non attribuisce il successivo intervallo a occhi aperti o chiusi', () => {
    const profile = { ...exampleCalibration, methodVersion: 'n03-ear-v1' };
    const engine = new TemporalEngine(); engine.start();
    engine.processSample({ timestampMs: 0, calibrationId: profile.id, left: { validity: 'valid', openness: 0 }, right: { validity: 'valid', openness: 0 } });
    const ambiguous = convertFaceLandmarkerResult({ faceLandmarks: [[], []] }, 100, 640, 480);
    const sample = toAnalysisSample(ambiguous.geometry, profile);
    expect(sample.left).toEqual({ validity: 'invalid', reasons: ['ambiguous_face'] });
    expect(engine.processSample(sample).status).toBe('accepted');
    expect(engine.processSample({ ...sample, timestampMs: 200 }).status).toBe('accepted');
    const snapshot = engine.getSnapshot();
    expect(snapshot.current.bilateral).toBe('unknown');
    expect(snapshot.session).toMatchObject({ validMs: 100, closedMs: 100, unknownMs: 100 });
    expect(snapshot.session.events.find((event) => event.kind === 'bilateral')).toMatchObject({ complete: false, endedReason: 'tracking_lost' });
    expect(snapshot.diagnostics.rejectedSamples).toBe(0);
  });
});
