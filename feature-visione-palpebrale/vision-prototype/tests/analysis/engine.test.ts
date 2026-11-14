import { describe, expect, it } from 'vitest';
import type { AnalysisSample } from '../../src/contracts/sample';
import { EngineConfigError, resolveEngineConfig } from '../../src/analysis/config';
import { EngineStateError, TemporalEngine } from '../../src/analysis/engine';
import { closedSample, openSample, stateSample } from '../../fixtures/support';

function run(samples: readonly AnalysisSample[], engine = new TemporalEngine()) {
  engine.start();
  for (const sample of samples) {
    engine.processSample(sample);
  }
  return engine;
}

describe('TemporalEngine — ciclo di vita', () => {
  it('rifiuta processSample prima di start', () => {
    const engine = new TemporalEngine();
    expect(() => engine.processSample(openSample(0))).toThrow(EngineStateError);
  });

  it('rifiuta processSample dopo stop', () => {
    const engine = run([openSample(0), openSample(100)]);
    engine.stop();
    expect(() => engine.processSample(openSample(200))).toThrow(EngineStateError);
  });

  it('reset cancella risultati e permette una nuova sessione', () => {
    const engine = run([openSample(0), closedSample(100), openSample(200)]);
    expect(engine.getSnapshot().session.events).toHaveLength(3);

    engine.reset();
    const idle = engine.getSnapshot();
    expect(idle.status).toBe('idle');
    expect(idle.session.elapsedMs).toBe(0);
    expect(idle.session.events).toEqual([]);
    expect(idle.diagnostics.acceptedSamples).toBe(0);

    engine.start();
    engine.processSample(openSample(0));
    const restarted = engine.getSnapshot();
    expect(restarted.status).toBe('running');
    expect(restarted.session.elapsedMs).toBe(0);
    expect(restarted.current.left.state).toBe('open');
  });

  it('stop rende incompleto un episodio ancora aperto senza prolungarlo', () => {
    const engine = run([openSample(0), closedSample(100), closedSample(200)]);
    engine.stop();

    const snapshot = engine.getSnapshot();
    expect(snapshot.status).toBe('stopped');
    expect(snapshot.session.closedMs).toBe(100);
    expect(snapshot.session.events).toHaveLength(3);
    for (const event of snapshot.session.events) {
      expect(event.complete).toBe(false);
      expect(event.endedReason).toBe('stopped');
      expect(event.endedAtMs).toBe(200);
      expect(event.durationMs).toBe(100);
    }
  });
});

describe('TemporalEngine — validazione', () => {
  it('valida la configurazione e identifica i valori usati', () => {
    const config = resolveEngineConfig({ closedEnter: 0.2, openExit: 0.5 });
    expect(config.closedEnter).toBe(0.2);
    expect(config.openExit).toBe(0.5);
    expect(config.configId).toContain('closedEnter=0.2');
    expect(config.configId).toContain('openExit=0.5');
  });

  it('rifiuta soglie non coerenti', () => {
    expect(() => resolveEngineConfig({ closedEnter: 0.5, openExit: 0.4 })).toThrow(
      EngineConfigError,
    );
    expect(() => resolveEngineConfig({ maxGapMs: 0 })).toThrow(EngineConfigError);
    expect(() => resolveEngineConfig({ rollingWindowMs: -1 })).toThrow(
      EngineConfigError,
    );
  });

  it('rifiuta un campione malformato senza modificare la misura', () => {
    const engine = run([openSample(0), openSample(100)]);
    const malformed = {
      timestampMs: Number.NaN,
      calibrationId: 'cal-a',
      left: { validity: 'valid', openness: 0.9 },
      right: { validity: 'valid', openness: 0.9 },
    } as unknown as AnalysisSample;

    const result = engine.processSample(malformed);
    if (result.status !== 'rejected') {
      throw new Error('Il campione malformato doveva essere rifiutato.');
    }
    expect(result.reason).toBe('invalid_timestamp');

    const snapshot = engine.getSnapshot();
    expect(snapshot.diagnostics.rejectedSamples).toBe(1);
    expect(snapshot.session.elapsedMs).toBe(100);
  });

  it('rifiuta osservazioni oculari fuori contratto', () => {
    const engine = new TemporalEngine();
    engine.start();
    const malformed = {
      timestampMs: 0,
      calibrationId: 'cal-a',
      left: { validity: 'invalid', reasons: ['motivo-inesistente'] },
      right: { validity: 'valid', openness: 0.9 },
    } as unknown as AnalysisSample;

    const result = engine.processSample(malformed);
    if (result.status !== 'rejected') {
      throw new Error('Il campione malformato doveva essere rifiutato.');
    }
    expect(result.reason).toBe('invalid_eye_observation');
  });
});

describe('TemporalEngine — tempo e frequenza', () => {
  it('è stabile su sequenze temporalmente equivalenti a frequenze diverse', () => {
    const pattern = (stepMs: number): AnalysisSample[] => {
      const samples: AnalysisSample[] = [];
      for (let t = 0; t <= 800; t += stepMs) {
        const closed = t >= 200 && t < 500;
        samples.push(
          stateSample(t, closed ? 0.1 : 0.9, closed ? 0.1 : 0.9),
        );
      }
      return samples;
    };

    const at100Ms = run(pattern(100)).getSnapshot();
    const at50Ms = run(pattern(50)).getSnapshot();

    for (const snapshot of [at100Ms, at50Ms]) {
      expect(snapshot.session.elapsedMs).toBe(800);
      expect(snapshot.session.validMs).toBe(800);
      expect(snapshot.session.closedMs).toBe(300);
      expect(snapshot.session.closureFraction).toBeCloseTo(0.375);
      expect(snapshot.session.closures).toMatchObject({
        episodeCount: 1,
        completeCount: 1,
        incompleteCount: 0,
        longestCompleteMs: 300,
      });
      expect(snapshot.session.events).toHaveLength(3);
      for (const event of snapshot.session.events) {
        expect(event.startedAtMs).toBe(200);
        expect(event.endedAtMs).toBe(500);
        expect(event.durationMs).toBe(300);
        expect(event.complete).toBe(true);
      }
    }
  });

  it('non attribuisce tempo valido all’intervallo oltre maxGapMs', () => {
    const engine = run([
      openSample(0),
      openSample(100),
      closedSample(200),
      closedSample(300),
      closedSample(1000),
      openSample(1100),
    ]);
    const snapshot = engine.getSnapshot();

    expect(snapshot.session.elapsedMs).toBe(1100);
    expect(snapshot.session.gapMs).toBe(700);
    expect(snapshot.session.validMs).toBe(400);
    expect(snapshot.session.closedMs).toBe(200);
    expect(snapshot.session.closures.completeCount).toBe(1);
    expect(snapshot.session.events[0]?.endedReason).toBe('gap');
  });

  it('tratta un cambio di calibrazione come discontinuità', () => {
    const engine = run([
      openSample(0),
      closedSample(100),
      closedSample(200),
      closedSample(300, 'cal-b'),
      openSample(400, 'cal-b'),
    ]);
    const snapshot = engine.getSnapshot();

    expect(snapshot.session.calibrationTransitionMs).toBe(100);
    expect(snapshot.session.validMs).toBe(300);
    expect(snapshot.calibrationIds).toEqual(['cal-a', 'cal-b']);
    expect(snapshot.session.events[0]?.endedReason).toBe('calibration_changed');
    expect(snapshot.session.events[0]?.complete).toBe(false);
  });
});

describe('TemporalEngine — finestra mobile', () => {
  it('non presenta come completa una chiusura tagliata dal bordo', () => {
    const engine = new TemporalEngine({ rollingWindowMs: 300 });
    engine.start();
    for (const sample of [
      openSample(0),
      closedSample(100),
      closedSample(200),
      closedSample(300),
      openSample(400),
      openSample(500),
    ]) {
      engine.processSample(sample);
    }

    const snapshot = engine.getSnapshot();
    const windowEvent = snapshot.window.events.find(
      (event) => event.kind === 'bilateral',
    );

    expect(windowEvent).toBeDefined();
    expect(windowEvent?.durationMs).toBe(300);
    expect(windowEvent?.complete).toBe(true);
    expect(windowEvent?.completeWithinWindow).toBe(false);
    expect(windowEvent?.truncatedAtStart).toBe(true);
    expect(windowEvent?.windowOverlapMs).toBe(200);
    expect(snapshot.window.closures.completeCount).toBe(0);
    expect(snapshot.window.closures.longestCompleteMs).toBeNull();
  });
});
