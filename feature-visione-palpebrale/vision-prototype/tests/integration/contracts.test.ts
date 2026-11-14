import { describe, expect, it } from 'vitest';
import { createContractExamples } from '../../fixtures/contract-examples';
import { TemporalEngine } from '../../src/analysis/engine';
import { EngineConfigError, resolveEngineConfig } from '../../src/analysis/config';
import { CONTRACT_VERSION } from '../../src/contracts';
import type { AnalysisSample, ApplicationSessionSnapshot } from '../../src/contracts';

describe('C01: produttore, motore e consumatore separato', () => {
  it('espone un evento completo e uno incompleto coerenti con i campioni', () => {
    const examples = createContractExamples();
    const complete = examples.complete.session.events.find((event) => event.kind === 'bilateral');
    const incomplete = examples.incomplete.session.events.find((event) => event.kind === 'bilateral');
    expect(complete).toMatchObject({ startedAtMs: 100, endedAtMs: 300, durationMs: 200, complete: true, endedReason: 'reopened' });
    expect(incomplete).toMatchObject({ startedAtMs: 100, endedAtMs: 200, durationMs: 100, complete: false, endedReason: 'tracking_lost' });
    expect(examples.complete.session.closureFraction).toBeCloseTo(2 / 3);
    expect(examples.complete.calibrationIds).toEqual([examples.calibration.id]);
  });

  it('distingue assenza di misura, assenza di dati validi e occhio chiuso', () => {
    const examples = createContractExamples();
    expect(new TemporalEngine().getSnapshot().session.coverage).toBeNull();
    expect(examples.unavailable.session).toMatchObject({ validMs: 0, coverage: 0, closureFraction: null });
    expect(examples.unavailable.current.left).toMatchObject({ state: 'unknown', openness: null, valid: false });
    expect(examples.validSample.left).toEqual({ validity: 'valid', openness: 0 });
    expect(examples.unavailable.session.events).toEqual([]);
  });

  it('conserva versioni, configurazione, calibrazione e motivi in un consumatore JSON senza React', () => {
    const examples = createContractExamples();
    const session: ApplicationSessionSnapshot = {
      contractVersion: CONTRACT_VERSION, phase: 'stopped', source: 'synthetic',
      calibration: { status: 'ready', profile: examples.calibration },
      engine: examples.unavailable, lastSample: examples.invalidSample,
      interruption: 'user_stop', error: null,
    };
    const parsed = JSON.parse(JSON.stringify(session)) as ApplicationSessionSnapshot;
    expect(parsed).toEqual(session);
    expect(parsed.engine?.schemaVersion).toBe('n02-snapshot-v1');
    expect(parsed.engine?.config.configId).toBe(examples.unavailable.config.configId);
    expect(parsed.calibration.status).toBe('ready');
    expect(parsed.lastSample?.left).toEqual({ validity: 'invalid', reasons: ['not_tracked'] });
    expect(parsed.engine?.session.closureFraction).toBeNull();
  });

  it.each([
    { validity: 'invalid', reasons: [] },
    { validity: 'invalid', reasons: ['not_tracked'], openness: 0 },
  ])('rifiuta un occhio invalido ambiguo: %j', (left) => {
    const examples = createContractExamples();
    const engine = new TemporalEngine();
    engine.start();
    const result = engine.processSample({ ...examples.validSample, left } as unknown as AnalysisSample);
    expect(result).toMatchObject({ status: 'rejected', reason: 'invalid_eye_observation' });
    expect(engine.getSnapshot().diagnostics.acceptedSamples).toBe(0);
  });

  it('rifiuta una calibrazione identificata soltanto da spazi', () => {
    const engine = new TemporalEngine();
    engine.start();
    expect(engine.processSample({ ...createContractExamples().validSample, calibrationId: '  ' }))
      .toMatchObject({ status: 'rejected', reason: 'invalid_calibration_id' });
  });

  it('rifiuta una versione di configurazione esplicitamente vuota', () => {
    expect(() => resolveEngineConfig({ version: '  ' })).toThrow(EngineConfigError);
    expect(resolveEngineConfig().version).toBe('n02-config-v1');
  });
});
