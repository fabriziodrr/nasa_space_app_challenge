import { describe, expect, it } from 'vitest';
import { fixtures } from '../../fixtures';
import { replayFixture } from '../analysis/replay';
import { prepareReplay } from './replay';

describe('replay per la UI', () => {
  for (const fixture of fixtures) {
    it(`conserva i risultati del motore per ${fixture.name}`, () => {
      const replay = prepareReplay(fixture);
      const reference = replayFixture(fixture);
      expect(replay.final).toEqual(reference.snapshot);
      expect(replay.steps.length).toBe(reference.results.filter((result) => result.status === 'accepted').length);
      expect(replay.steps.map((step) => step.sample.timestampMs)).toEqual(
        reference.results.filter((result) => result.status === 'accepted').map((result) => result.timestampMs),
      );
    });
  }
});
