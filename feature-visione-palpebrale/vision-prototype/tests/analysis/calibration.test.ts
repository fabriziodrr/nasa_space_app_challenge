import { describe, expect, it } from 'vitest';
import { TemporalEngine } from '../../src/analysis/engine';
import type { FaceGeometryObservation } from '../../src/contracts/geometry';
import type { EyeGeometryObservation } from '../../src/contracts/geometry';
import type { EyeSide } from '../../src/contracts/sample';
import {
  CalibrationCollector,
  CalibrationConfigError,
  CalibrationStateError,
  calibrateFaceGeometry,
  normalizeOpenness,
  resolveCalibrationConfig,
  toAnalysisSample,
  toCalibrationState,
} from '../../src/analysis/calibration';

const TEST_CONFIG = {
  requiredSamplesPerEye: 3,
  maxReferenceDeviation: 0.05,
  minimumSeparation: 0.05,
};

function eyeObservation(
  side: EyeSide,
  ear: number | null,
): EyeGeometryObservation {
  if (ear === null) {
    return {
      side,
      horizontalWidthPx: 0,
      valid: false,
      invalidityReasons: ['geometry_invalid'],
    };
  }

  return {
    side,
    eyeAspectRatio: ear,
    horizontalWidthPx: 100,
    valid: true,
    invalidityReasons: [],
  };
}

function face(
  timestampMs: number,
  leftEar: number | null,
  rightEar: number | null,
): FaceGeometryObservation {
  return {
    timestampMs,
    methodVersion: 'n03-ear-v1',
    imageWidth: 640,
    imageHeight: 480,
    left: eyeObservation('left', leftEar),
    right: eyeObservation('right', rightEar),
  };
}

function addPhase(
  collector: CalibrationCollector,
  phase: 'open' | 'closed',
  leftValues: readonly number[],
  rightValues: readonly number[],
): void {
  collector.beginPhase(phase);

  for (let index = 0; index < leftValues.length; index += 1) {
    collector.addSample(
      face(index, leftValues[index] ?? null, rightValues[index] ?? null),
    );
  }
}

describe('Calibrazione N03', () => {
  it('mantiene distinto il completamento della raccolta dal profilo pronto C01', () => {
    const collector = new CalibrationCollector(TEST_CONFIG);
    expect(toCalibrationState(collector.getProgress())).toEqual({ status: 'idle' });
    addPhase(collector, 'open', [0.3, 0.3, 0.3], [0.3, 0.3, 0.3]);
    expect(toCalibrationState(collector.getProgress())).toMatchObject({
      status: 'collecting', reference: 'open', acceptedSamples: { left: 3, right: 3 },
      requiredSamplesPerEye: 3,
    });
    addPhase(collector, 'closed', [0.1, 0.1, 0.1], [0.1, 0.1, 0.1]);
    expect(collector.getProgress().status).toBe('ready');
    expect(toCalibrationState(collector.getProgress()).status).toBe('collecting');
    const outcome = collector.finish({ id: 'cal-c01', capturedAtMs: 1000 });
    expect(toCalibrationState(collector.getProgress(), outcome)).toEqual({ status: 'ready', profile: outcome.profile });
    expect(() => toCalibrationState(collector.getProgress())).toThrow(CalibrationStateError);
  });

  it('conserva i motivi dettagliati N03 e li traduce nei motivi applicativi C01', () => {
    const collector = new CalibrationCollector(TEST_CONFIG);
    collector.start();
    const outcome = collector.finish({ id: 'cal-empty', capturedAtMs: 1000 });
    expect(outcome.reasons).toEqual(['not_enough_open_samples', 'not_enough_closed_samples']);
    expect(toCalibrationState(collector.getProgress(), outcome)).toMatchObject({
      status: 'insufficient', reasons: ['insufficient_samples'],
    });
    addPhase(collector, 'open', [0.15, 0.15, 0.15], [0.15, 0.15, 0.15]);
    addPhase(collector, 'closed', [0.12, 0.12, 0.12], [0.12, 0.12, 0.12]);
    const small = collector.finish({ id: 'cal-separation', capturedAtMs: 2000 });
    expect(toCalibrationState(collector.getProgress(), small)).toMatchObject({
      status: 'insufficient', reasons: ['insufficient_separation'],
    });
  });

  it('non mescola metodi geometrici e non applica riferimenti a un metodo diverso', () => {
    const collector = new CalibrationCollector(TEST_CONFIG);
    collector.start();
    collector.addSample(face(0, 0.3, 0.3));
    expect(() => collector.addSample({ ...face(1, 0.3, 0.3), methodVersion: 'other-method' }))
      .toThrow(CalibrationStateError);
    addPhase(collector, 'open', [0.3, 0.3, 0.3], [0.3, 0.3, 0.3]);
    addPhase(collector, 'closed', [0.1, 0.1, 0.1], [0.1, 0.1, 0.1]);
    const profile = collector.finish({ id: 'cal-method', capturedAtMs: 1000 }).profile;
    if (profile === null) throw new Error('Profilo atteso');
    expect(profile.methodVersion).toBe('n03-ear-v1');
    expect(() => toAnalysisSample({ ...face(2, 0.3, 0.3), methodVersion: 'other-method' }, profile))
      .toThrow(CalibrationStateError);
    collector.reset();
    collector.start();
    expect(() => collector.addSample({ ...face(3, 0.3, 0.3), methodVersion: 'other-method' })).not.toThrow();
  });

  it('propaga un occhio non valutabile senza valore numerico e con motivi non vuoti', () => {
    const collector = new CalibrationCollector(TEST_CONFIG);
    addPhase(collector, 'open', [0.3, 0.3, 0.3], [0.3, 0.3, 0.3]);
    addPhase(collector, 'closed', [0.1, 0.1, 0.1], [0.1, 0.1, 0.1]);
    const profile = collector.finish({ id: 'cal-invalid', capturedAtMs: 1000 }).profile;
    if (profile === null) throw new Error('Profilo atteso');
    const sample = toAnalysisSample(face(10, null, 0.3), profile);
    expect(sample.left).toEqual({ validity: 'invalid', reasons: ['geometry_invalid'] });
    expect(sample.left).not.toHaveProperty('openness');
    expect(sample.right.validity).toBe('valid');
    const engine = new TemporalEngine();
    engine.start();
    expect(engine.processSample(sample).status).toBe('accepted');
    expect(engine.getSnapshot().current.left.state).toBe('unknown');
    expect(() => collector.finish({ id: '  ', capturedAtMs: 1000 })).toThrow(CalibrationStateError);
  });

  it('raccoglie riferimenti, calcola le mediane e produce una calibrazione', () => {
    const collector = new CalibrationCollector(TEST_CONFIG);

    collector.start();
    expect(collector.getProgress().status).toBe('collecting');
    expect(collector.getProgress().activePhase).toBe('open');

    for (const sample of [
      face(0, 0.3, 0.32),
      face(1, 0.31, 0.31),
      face(2, 0.29, 0.3),
    ]) {
      collector.addSample(sample);
    }

    expect(collector.getProgress().open.complete).toBe(true);
    expect(collector.getProgress().status).toBe('collecting');

    collector.beginPhase('closed');
    for (const sample of [
      face(3, 0.1, 0.12),
      face(4, 0.11, 0.11),
      face(5, 0.09, 0.1),
    ]) {
      collector.addSample(sample);
    }

    const ready = collector.getProgress();
    expect(ready.status).toBe('ready');
    expect(ready.open.fraction).toBe(1);
    expect(ready.closed.fraction).toBe(1);

    const outcome = collector.finish({ id: 'cal-test', capturedAtMs: 1000 });
    expect(outcome.success).toBe(true);
    expect(outcome.status).toBe('completed');
    expect(outcome.reasons).toEqual([]);
    expect(outcome.profile).not.toBeNull();

    const profile = outcome.profile;
    if (profile === null) {
      throw new Error('La calibrazione doveva riuscire.');
    }

    expect(profile.id).toBe('cal-test');
    expect(profile.methodVersion).toBe('n03-ear-v1');
    expect(profile.normalization).toBe('open-closed-v1');
    expect(profile.eyes.left.open).toBeCloseTo(0.3, 12);
    expect(profile.eyes.left.closed).toBeCloseTo(0.1, 12);
    expect(profile.eyes.right.open).toBeCloseTo(0.31, 12);
    expect(profile.eyes.right.closed).toBeCloseTo(0.11, 12);
    expect(profile.eyes.left.minimumSeparation).toBe(0.05);

    expect(normalizeOpenness(0.3, profile.eyes.left)).toBeCloseTo(1, 12);
    expect(normalizeOpenness(0.2, profile.eyes.left)).toBeCloseTo(0.5, 12);
    expect(normalizeOpenness(0.1, profile.eyes.left)).toBeCloseTo(0, 12);

    const calibrated = calibrateFaceGeometry(face(10, 0.3, 0.31), profile);
    expect(calibrated.left.validity).toBe('valid');
    if (calibrated.left.validity !== 'valid') {
      throw new Error('L’occhio sinistro doveva essere valutabile.');
    }
    expect(calibrated.left.openness).toBeCloseTo(1, 12);
    expect(calibrated.right.validity).toBe('valid');

    const sample = toAnalysisSample(face(11, 0.2, 0.21), profile);
    expect(sample.timestampMs).toBe(11);
    expect(sample.calibrationId).toBe('cal-test');
    expect(sample.left.validity).toBe('valid');
    if (sample.left.validity !== 'valid') {
      throw new Error('L’occhio sinistro doveva essere valutabile.');
    }
    expect(sample.left.openness).toBeCloseTo(0.5, 12);
    expect(sample.right.validity).toBe('valid');
  });

  it('restituisce motivi distinti quando i campioni non bastano', () => {
    const collector = new CalibrationCollector(TEST_CONFIG);

    collector.start();
    collector.addSample(face(0, 0.3, 0.3));
    collector.addSample(face(1, 0.3, 0.3));

    collector.beginPhase('closed');
    collector.addSample(face(2, 0.1, 0.1));
    collector.addSample(face(3, 0.1, 0.1));

    const outcome = collector.finish({ id: 'cal-fail', capturedAtMs: 10 });

    expect(outcome.success).toBe(false);
    expect(outcome.status).toBe('failed');
    expect(outcome.profile).toBeNull();
    expect(outcome.reasons).toContain('not_enough_open_samples');
    expect(outcome.reasons).toContain('not_enough_closed_samples');
    expect(outcome.eyes.left.reasons).toEqual(
      expect.arrayContaining([
        'not_enough_open_samples',
        'not_enough_closed_samples',
      ]),
    );
    expect(collector.getProgress().status).toBe('failed');
  });

  it('rifiuta riferimenti instabili', () => {
    const collector = new CalibrationCollector(TEST_CONFIG);

    addPhase(collector, 'open', [0.2, 0.4, 0.3], [0.2, 0.4, 0.3]);
    addPhase(collector, 'closed', [0.1, 0.1, 0.1], [0.1, 0.1, 0.1]);

    const outcome = collector.finish({ id: 'cal-unstable', capturedAtMs: 20 });

    expect(outcome.success).toBe(false);
    expect(outcome.reasons).toContain('unstable_open');
    expect(outcome.eyes.left.openDeviation).toBeCloseTo(0.1, 12);
    expect(toCalibrationState(collector.getProgress(), outcome)).toMatchObject({
      status: 'insufficient', reasons: ['unstable_reference'], details: ['unstable_open'],
    });
  });

  it('rifiuta una separazione insufficiente fra aperto e chiuso', () => {
    const collector = new CalibrationCollector(TEST_CONFIG);

    addPhase(collector, 'open', [0.15, 0.16, 0.15], [0.15, 0.16, 0.15]);
    addPhase(collector, 'closed', [0.12, 0.13, 0.12], [0.12, 0.13, 0.12]);

    const outcome = collector.finish({ id: 'cal-small', capturedAtMs: 30 });

    expect(outcome.success).toBe(false);
    expect(outcome.reasons).toContain('separation_too_small');
    expect(outcome.eyes.right.references).toBeNull();
  });

  it('ignora gli occhi non validi e valuta i due occhi separatamente', () => {
    const collector = new CalibrationCollector({
      ...TEST_CONFIG,
      requiredSamplesPerEye: 2,
    });

    collector.start();
    collector.addSample(face(0, null, 0.3));
    collector.addSample(face(1, 0.3, 0.3));

    collector.beginPhase('closed');
    collector.addSample(face(2, null, 0.1));
    collector.addSample(face(3, 0.1, 0.1));

    const outcome = collector.finish({ id: 'cal-one-eye', capturedAtMs: 40 });

    expect(outcome.success).toBe(false);
    expect(outcome.eyes.left.success).toBe(false);
    expect(outcome.eyes.left.samples).toEqual({ open: 1, closed: 1 });
    expect(outcome.eyes.left.reasons).toContain('not_enough_open_samples');
    expect(outcome.eyes.right.success).toBe(true);
    expect(outcome.eyes.right.references).not.toBeNull();
  });

  it('non accumula campioni senza limite quando un solo occhio resta valutabile', () => {
    const collector = new CalibrationCollector({ ...TEST_CONFIG, requiredSamplesPerEye: 2 });
    collector.start();
    for (let i = 0; i < 1000; i++) collector.addSample(face(i, 0.3, null));
    expect(collector.getProgress().open.samples).toEqual({ left: 2, right: 0 });
    expect(collector.getProgress().open.complete).toBe(false);
  });

  it('espone gli errori d’uso e permette di ricominciare', () => {
    const collector = new CalibrationCollector(TEST_CONFIG);
    expect(() => collector.addSample(face(0, 0.3, 0.3))).toThrow(
      CalibrationStateError,
    );
    expect(() => collector.finish({ id: '', capturedAtMs: 0 })).toThrow(
      CalibrationStateError,
    );

    addPhase(collector, 'open', [0.3, 0.3, 0.3], [0.3, 0.3, 0.3]);
    addPhase(collector, 'closed', [0.1, 0.1, 0.1], [0.1, 0.1, 0.1]);
    const outcome = collector.finish({ id: 'cal-restart', capturedAtMs: 50 });
    expect(outcome.success).toBe(true);

    collector.beginPhase('open');
    const restarted = collector.getProgress();
    expect(restarted.status).toBe('collecting');
    expect(restarted.open.samples).toEqual({ left: 0, right: 0 });
    expect(restarted.closed.samples).toEqual({ left: 0, right: 0 });
  });

  it('valida la configurazione di calibrazione', () => {
    expect(
      resolveCalibrationConfig({ requiredSamplesPerEye: 4 }).configId,
    ).toContain('requiredSamplesPerEye=4');
    expect(() =>
      resolveCalibrationConfig({ requiredSamplesPerEye: 1 }),
    ).toThrow(CalibrationConfigError);
    expect(() => resolveCalibrationConfig({ minimumSeparation: 0 })).toThrow(
      CalibrationConfigError,
    );
  });
});
