import { describe, expect, it } from 'vitest';
import { fixtures } from '../../fixtures';
import { replayFixture } from '../../src/analysis/replay';

describe('fixture N02', () => {
  for (const fixture of fixtures) {
    it(`${fixture.name}: ${fixture.description}`, () => {
      const { snapshot } = replayFixture(fixture);
      expect(snapshot).toMatchObject(fixture.expected);
    });
  }
});
