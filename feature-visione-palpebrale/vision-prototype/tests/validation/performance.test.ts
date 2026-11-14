import { describe, expect, it } from 'vitest';
import {
  measureInference,
  summarizeInferencePerformance,
} from '../../src/validation/performance';
import { ValidationError } from '../../src/validation/types';

describe('N05: riepilogo prestazioni di inferenza', () => {
  it('calcola frequenza, media, minimo, massimo e percentili', () => {
    const summary = summarizeInferencePerformance([
      { timestampMs: 0, inferenceMs: 10 },
      { timestampMs: 100, inferenceMs: 20 },
      { timestampMs: 200, inferenceMs: 30 },
      { timestampMs: 300, inferenceMs: 40 },
    ]);

    expect(summary).toEqual({
      count: 4,
      intervalMs: 300,
      framesPerSecond: 10,
      meanInferenceMs: 25,
      minInferenceMs: 10,
      maxInferenceMs: 40,
      p50InferenceMs: 25,
      p95InferenceMs: 38.5,
    });
  });

  it('gestisce un campione singolo e una serie vuota', () => {
    expect(
      summarizeInferencePerformance([{ timestampMs: 10, inferenceMs: 12 }]),
    ).toMatchObject({
      count: 1,
      intervalMs: 0,
      framesPerSecond: null,
      meanInferenceMs: 12,
      p50InferenceMs: 12,
      p95InferenceMs: 12,
    });

    expect(summarizeInferencePerformance([])).toMatchObject({
      count: 0,
      framesPerSecond: null,
      meanInferenceMs: null,
    });
  });

  it('rifiuta timestamp decrescenti e latenze negative', () => {
    expect(() =>
      summarizeInferencePerformance([
        { timestampMs: 100, inferenceMs: 5 },
        { timestampMs: 50, inferenceMs: 5 },
      ]),
    ).toThrow(ValidationError);

    expect(() =>
      summarizeInferencePerformance([
        { timestampMs: 0, inferenceMs: -1 },
      ]),
    ).toThrow(ValidationError);
  });

  it('misura un’operazione con un orologio iniettato', () => {
    let now = 100;
    const measured = measureInference(() => {
      now += 15;
      return 'ok';
    }, () => now);

    expect(measured).toEqual({ value: 'ok', inferenceMs: 15 });
  });

  it('rifiuta un orologio che torna indietro', () => {
    let now = 100;
    expect(() =>
      measureInference(() => {
        now -= 5;
        return null;
      }, () => now),
    ).toThrow(ValidationError);
  });
});
