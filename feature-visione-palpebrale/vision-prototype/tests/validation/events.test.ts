import { describe, expect, it } from 'vitest';
import { event } from '../../fixtures/support';
import { matchClosureEvents } from '../../src/validation/events';
import type { AnnotatedClosure } from '../../src/validation/types';
import { ValidationError } from '../../src/validation/types';

function annotation(
  id: string,
  startMs: number,
  endMs: number,
  complete?: boolean,
): AnnotatedClosure {
  return { id, startMs, endMs, complete };
}

describe('N05: abbinamento fra annotazioni ed eventi del motore', () => {
  it('riconosce una chiusura completa con errore nullo', () => {
    const result = matchClosureEvents(
      [annotation('a', 100, 300, true)],
      [event('bilateral', 1, 100, 300, true, 'reopened', 200)],
    );

    expect(result).toMatchObject({
      annotationsCount: 1,
      predictionsCount: 1,
      truePositiveCount: 1,
      falseNegativeCount: 0,
      falsePositiveCount: 0,
      precision: 1,
      recall: 1,
      f1: 1,
      completenessMismatchCount: 0,
      meanAbsoluteStartErrorMs: 0,
      meanAbsoluteEndErrorMs: 0,
      meanAbsoluteDurationErrorMs: 0,
    });
    expect(result.matched[0]).toMatchObject({
      annotationId: 'a',
      predictedId: 'bilateral-1',
      iou: 1,
      startErrorMs: 0,
      endErrorMs: 0,
      durationErrorMs: 0,
      completenessMatches: true,
    });
  });

  it('distingue eventi mancanti e falsi positivi', () => {
    const result = matchClosureEvents(
      [annotation('a', 100, 300, true)],
      [event('bilateral', 1, 400, 500, true, 'reopened', 100)],
    );

    expect(result).toMatchObject({
      truePositiveCount: 0,
      falseNegativeCount: 1,
      falsePositiveCount: 1,
      precision: 0,
      recall: 0,
      f1: null,
    });
    expect(result.falseNegatives.map((item) => item.id)).toEqual(['a']);
    expect(result.falsePositives.map((item) => item.id)).toEqual(['bilateral-1']);
  });

  it('accetta un evento vicino entro tolleranza e riporta gli errori', () => {
    const result = matchClosureEvents(
      [annotation('a', 100, 300, true)],
      [event('bilateral', 1, 120, 280, true, 'reopened', 160)],
    );

    expect(result.truePositiveCount).toBe(1);
    expect(result.matched[0]).toMatchObject({
      iou: 0.8,
      startErrorMs: 20,
      endErrorMs: -20,
      durationErrorMs: -40,
    });
    expect(result.meanAbsoluteStartErrorMs).toBe(20);
    expect(result.meanAbsoluteEndErrorMs).toBe(20);
    expect(result.meanAbsoluteDurationErrorMs).toBe(40);
  });

  it('abbina uno-a-uno senza riutilizzare lo stesso evento', () => {
    const result = matchClosureEvents(
      [annotation('a', 100, 300), annotation('b', 500, 700)],
      [
        event('bilateral', 1, 490, 690, true, 'reopened', 200),
        event('bilateral', 2, 110, 310, true, 'reopened', 200),
      ],
    );

    expect(result.truePositiveCount).toBe(2);
    expect(result.matched.map((item) => [item.annotationId, item.predictedId])).toEqual([
      ['a', 'bilateral-2'],
      ['b', 'bilateral-1'],
    ]);
  });

  it('segnala una differenza di completezza', () => {
    const result = matchClosureEvents(
      [annotation('a', 100, 300, true)],
      [event('bilateral', 1, 100, 300, false, 'tracking_lost', 200)],
    );

    expect(result.completenessMismatchCount).toBe(1);
    expect(result.matched[0]?.completenessMatches).toBe(false);
  });

  it('lascia nulli precision e recall quando manca un lato del confronto', () => {
    const noAnnotations = matchClosureEvents(
      [],
      [event('bilateral', 1, 100, 200, true, 'reopened', 100)],
    );
    expect(noAnnotations.precision).toBe(0);
    expect(noAnnotations.recall).toBeNull();
    expect(noAnnotations.f1).toBeNull();

    const noPredictions = matchClosureEvents([annotation('a', 100, 200)], []);
    expect(noPredictions.precision).toBeNull();
    expect(noPredictions.recall).toBe(0);
    expect(noPredictions.f1).toBeNull();
  });

  it('valida annotazioni e opzioni', () => {
    expect(() =>
      matchClosureEvents([annotation('a', 300, 100)], []),
    ).toThrow(ValidationError);
    expect(() =>
      matchClosureEvents([], [], { minIou: 2 }),
    ).toThrow(ValidationError);
  });
});
