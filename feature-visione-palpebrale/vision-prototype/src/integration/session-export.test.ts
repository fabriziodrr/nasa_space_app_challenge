import { describe, expect, it } from 'vitest';
import { fixtures } from '../../fixtures';
import { exampleCalibration } from '../../fixtures/contract-examples';
import { TemporalEngine } from '../../src/analysis/engine';
import { replayFixture } from '../../src/analysis/replay';
import { prepareReplay } from '../../src/app/replay';
import { resolveCalibrationConfig } from '../../src/analysis/calibration';
import { MediaPipeFaceLandmarkerAdapter } from '../../src/inference/mediapipe-adapter';
import { createSessionExport, serializeSessionExport, summarizeExport } from '../../src/integration/session-export';
import type { SessionExport } from '../../src/integration/session-export';
import { createSessionValidationReport } from '../../src/validation/session-report';
import { parseSessionExport } from '../../src/integration/parse-session-export';

const date = '2026-11-13T12:00:00.000Z';
const adapter = new MediaPipeFaceLandmarkerAdapter({ modelAssetPath: '/models/face_landmarker.task', wasmAssetPath: '/models/wasm/' });
const extra = { performanceSamples: [], imageDimensions: { width: 640, height: 480 }, device: null, limits: { maxSamples: 18_000, maxChartPoints: 2_000, chartReduced: false },
  application: { phase: 'stopped' as const, interruption: 'user_stop' as const, error: null } };

describe('esportazione sessioni T05', () => {
  for (const fixture of fixtures) {
    it(`serializza e riproduce il risultato sintetico ${fixture.name}`, () => {
      const snapshot = replayFixture(fixture).snapshot;
      const exported = createSessionExport({ source: 'synthetic', fixture, snapshot, samples: fixture.samples }, date);
      const decoded = JSON.parse(serializeSessionExport(exported)) as SessionExport;
      expect(parseSessionExport(serializeSessionExport(exported))).toEqual(decoded);
      expect(decoded.source).toMatchObject({ kind: 'synthetic', fixtureName: fixture.name });
      expect(decoded.calibration.kind).toBe('synthetic-normalized');
      expect(decoded.inference).toBeNull();
      expect(decoded.timeOriginUnixMs).toBeNull();
      expect(decoded.snapshot).toEqual(snapshot);
      expect(summarizeExport(decoded).closureFraction).toBe(snapshot.session.closureFraction);
      const engine = new TemporalEngine(decoded.snapshot.config);
      engine.start();
      for (const sample of decoded.samples) engine.processSample(sample);
      if (decoded.snapshot.status === 'stopped') engine.stop();
      expect(engine.getSnapshot()).toEqual(decoded.snapshot);
    });
  }

  it('conserva profilo, configurazioni, provenienza e null della sessione webcam', () => {
    const engine = new TemporalEngine();
    engine.start();
    const samples = [0, 100].map((timestampMs) => ({ timestampMs, calibrationId: exampleCalibration.id,
      left: { validity: 'invalid' as const, reasons: ['not_tracked'] as const },
      right: { validity: 'invalid' as const, reasons: ['not_tracked'] as const } }));
    samples.forEach((sample) => engine.processSample(sample));
    engine.stop();
    const snapshot = engine.getSnapshot();
    const exported = createSessionExport({ ...extra, source: 'webcam', samples, snapshot, calibrations: [{ profile: exampleCalibration, config: resolveCalibrationConfig() }], timeOriginUnixMs: 123456,
      inference: { config: adapter.getConfig(), provenance: adapter.getProvenance() } }, date);
    const decoded = JSON.parse(serializeSessionExport(exported)) as SessionExport;
    expect(parseSessionExport(serializeSessionExport(exported))).toEqual(decoded);
    expect(decoded.source.kind).toBe('webcam');
    expect(decoded.calibration).toMatchObject({ kind: 'profiles', profiles: [exampleCalibration], configurations: { [exampleCalibration.id]: resolveCalibrationConfig() } });
    expect(decoded.inference?.provenance.modelSha256).toBe(adapter.getProvenance().modelSha256);
    expect(decoded.timeOriginUnixMs).toBe(123456);
    expect(decoded.snapshot.session).toMatchObject({ coverage: 0, closureFraction: null, validMs: 0 });
    expect(decoded.unavailable).toEqual({ coverage: null, closureFraction: 'no_valid_time', longestCompleteMs: 'no_complete_events' });
    expect(decoded.samples[0]?.left).toEqual({ validity: 'invalid', reasons: ['not_tracked'] });
  });

  it('mantiene coerenti istantanea mostrata e campioni anche nei replay parziali con rifiuti', () => {
    for (const fixture of fixtures) {
      for (const step of prepareReplay(fixture).steps) {
        const samples = fixture.samples.slice(0, fixture.samples.indexOf(step.sample) + 1);
        const data = createSessionExport({ source: 'synthetic', fixture, snapshot: step.snapshot, samples }, date);
        const engine = new TemporalEngine(data.snapshot.config);
        engine.start();
        for (const sample of data.samples) engine.processSample(sample);
        expect(engine.getSnapshot()).toEqual(data.snapshot);
      }
    }
  });

  it('non esporta una sessione webcam senza i profili richiesti', () => {
    const engine = new TemporalEngine();
    engine.start();
    engine.processSample({ timestampMs: 0, calibrationId: 'altro', left: { validity: 'valid', openness: 1 }, right: { validity: 'valid', openness: 1 } });
    expect(() => createSessionExport({ ...extra, source: 'webcam', samples: [], snapshot: engine.getSnapshot(), calibrations: [{ profile: exampleCalibration, config: resolveCalibrationConfig() }], timeOriginUnixMs: 0,
      inference: { config: adapter.getConfig(), provenance: adapter.getProvenance() } }, date)).toThrow('profilo');
  });

  it('risolve tutte le calibrazioni e conserva la configurazione propria di ciascun profilo', () => {
    const engine = new TemporalEngine(); engine.start();
    const second = { ...exampleCalibration, id: 'cal-seconda' };
    const samples = [exampleCalibration.id, second.id].map((calibrationId, index) => ({ timestampMs: index * 100, calibrationId,
      left: { validity: 'valid' as const, openness: 1 }, right: { validity: 'valid' as const, openness: 1 } }));
    samples.forEach((sample) => engine.processSample(sample));
    const firstConfig = resolveCalibrationConfig({ requiredSamplesPerEye: 4 });
    const secondConfig = resolveCalibrationConfig({ requiredSamplesPerEye: 12 });
    const input = { ...extra, source: 'webcam' as const, samples, snapshot: engine.getSnapshot(), timeOriginUnixMs: 0,
      inference: { config: adapter.getConfig(), provenance: adapter.getProvenance() },
      calibrations: [{ profile: exampleCalibration, config: firstConfig }, { profile: second, config: secondConfig }] };
    const data = createSessionExport(input, date);
    expect(data.schemaVersion).toBe('crewready-session-v2');
    expect(data.calibration).toMatchObject({ profiles: [exampleCalibration, second], configurations: { [exampleCalibration.id]: firstConfig, [second.id]: secondConfig } });
    expect(() => createSessionExport({ ...input, calibrations: [input.calibrations[0]!] }, date)).toThrow('profilo');
    expect(() => createSessionExport({ ...input, calibrations: [input.calibrations[0]!, input.calibrations[0]!] }, date)).toThrow();
  });

  it('produce un report prestazioni senza inventare annotazioni e conserva il contesto', () => {
    const engine = new TemporalEngine(); engine.start();
    const samples = [{ timestampMs: 0, calibrationId: exampleCalibration.id, left: { validity: 'valid' as const, openness: 1 }, right: { validity: 'valid' as const, openness: 1 } }];
    samples.forEach((sample) => engine.processSample(sample));
    const data = createSessionExport({ ...extra, source: 'webcam', samples, snapshot: engine.getSnapshot(),
      calibrations: [{ profile: exampleCalibration, config: resolveCalibrationConfig() }], timeOriginUnixMs: 100,
      performanceSamples: [{ timestampMs: 0, inferenceMs: 10 }, { timestampMs: 100, inferenceMs: 20 }],
      inference: { config: adapter.getConfig(), provenance: adapter.getProvenance() } }, date);
    const report = createSessionValidationReport(data);
    expect(report.comparison).toBeNull();
    expect(report.annotations).toBeNull();
    expect(report.performance).toMatchObject({ count: 2, framesPerSecond: 10, meanInferenceMs: 15 });
    expect(report.calibration).toEqual(data.calibration);
    expect(report.inference).toEqual(data.inference);
    const annotated = createSessionValidationReport(data, [], { minIou: 0.7 });
    expect(annotated.comparison).not.toBeNull();
    expect(annotated.matchingOptions).toEqual({ minIou: 0.7, startToleranceMs: 100, endToleranceMs: 100 });
  });

  it('identifica il contenuto della fixture oltre alla versione dello schema', () => {
    const fixture = fixtures[0]!;
    const first = createSessionExport({ source: 'synthetic', fixture, samples: fixture.samples, snapshot: replayFixture(fixture).snapshot }, date);
    const changed = { ...fixture, samples: fixture.samples.map((sample, index) => index === 0 ? { ...sample, timestampMs: sample.timestampMs + 0.01 } : sample) };
    const second = createSessionExport({ source: 'synthetic', fixture: changed, samples: changed.samples, snapshot: replayFixture(changed).snapshot }, date);
    expect(first.source.kind).toBe('synthetic');
    if (first.source.kind !== 'synthetic' || second.source.kind !== 'synthetic') throw new Error('Origine attesa');
    expect(first.source.fixtureVersion).toBe(second.source.fixtureVersion);
    expect(first.source.fixtureName).toBe(second.source.fixtureName);
    expect(first.source.fixtureFingerprint).not.toBe(second.source.fixtureFingerprint);
  });

  it('rifiuta numeri non finiti invece di convertirli silenziosamente in null', () => {
    const fixture = fixtures[0]!;
    const snapshot = replayFixture(fixture).snapshot;
    const bad = { ...fixture.samples[0]!, timestampMs: Number.NaN };
    expect(() => createSessionExport({ source: 'synthetic', fixture, snapshot, samples: [bad] }, date)).toThrow('non serializzabile');
  });

  it('rifiuta JSON esterni con schema errato, profilo mancante o istantanea manipolata', () => {
    const fixture = fixtures[0]!;
    const snapshot = replayFixture(fixture).snapshot;
    const exported = createSessionExport({ source: 'synthetic', fixture, snapshot, samples: fixture.samples }, date);
    expect(() => parseSessionExport('{')).toThrow('sintassi');
    expect(() => parseSessionExport(JSON.stringify({ ...exported, schemaVersion: 'crewready-session-v1' }))).toThrow('versione');
    expect(() => parseSessionExport(JSON.stringify({ ...exported, calibration: null }))).toThrow('calibrazione');
    const altered = JSON.parse(JSON.stringify(exported));
    altered.snapshot.session.closedMs = 999;
    expect(() => parseSessionExport(JSON.stringify(altered))).toThrow('non coerente');
    const badSample = JSON.parse(JSON.stringify(exported));
    badSample.samples[0].left = { validity: 'invalid', reasons: [] };
    expect(() => parseSessionExport(JSON.stringify(badSample))).toThrow('campione');
  });
});
