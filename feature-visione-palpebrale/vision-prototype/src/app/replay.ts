import { TemporalEngine } from '../analysis/engine';
import type { AnalysisSample, EngineSnapshot, ReplayFixture } from '../contracts';

export interface ReplayStep {
  readonly sample: AnalysisSample;
  readonly snapshot: EngineSnapshot;
  readonly gap: boolean;
  readonly calibrationChanged: boolean;
}

/** Le sequenze usano il motore reale; i campioni rifiutati non creano punti. */
export function prepareReplay(fixture: ReplayFixture): { steps: ReplayStep[]; final: EngineSnapshot } {
  const engine = new TemporalEngine(fixture.config);
  engine.start();
  const steps: ReplayStep[] = [];
  for (const sample of fixture.samples) {
    const result = engine.processSample(sample);
    if (result.status === 'accepted') {
      steps.push({ sample, snapshot: engine.getSnapshot(), gap: result.gap, calibrationChanged: result.calibrationChanged });
    }
  }
  if (fixture.stopAfterSamples) engine.stop();
  return { steps, final: engine.getSnapshot() };
}
