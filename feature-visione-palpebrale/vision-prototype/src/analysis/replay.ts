import type { EngineSnapshot } from '../contracts/engine';
import type { ReplayFixture } from '../contracts/replay';
import { TemporalEngine } from './engine';

export interface ReplayResult {
  readonly snapshot: EngineSnapshot;
  readonly results: readonly ReturnType<TemporalEngine['processSample']>[];
}

/**
 * Riproduce una fixture senza webcam o DOM.
 *
 * Tutti i campioni vengono offerti nell'ordine dichiarato; il motore applica le
 * normali regole di rifiuto per duplicati e timestamp fuori ordine. Se
 * `stopAfterSamples` è vero, la sessione viene arrestata come farebbe
 * l'applicazione al termine del replay.
 */
export function replayFixture(fixture: ReplayFixture): ReplayResult {
  const engine = new TemporalEngine(fixture.config);
  engine.start();

  const results = fixture.samples.map((sample) => engine.processSample(sample));

  if (fixture.stopAfterSamples === true) {
    engine.stop();
  }

  return Object.freeze({
    snapshot: engine.getSnapshot(),
    results: Object.freeze(results),
  });
}
