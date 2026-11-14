import { describe, expect, it } from 'vitest';
import type { EyelidLandmarks } from '../../src/contracts/geometry';
import {
  GEOMETRY_METHOD_VERSION,
  GeometryConfigError,
  calculateEyeGeometry,
  calculateFaceGeometry,
  resolveGeometryConfig,
} from '../../src/analysis/geometry';

function pixelEye(): EyelidLandmarks {
  return {
    outerCorner: { x: 0, y: 50 },
    upperOuter: { x: 25, y: 40 },
    upperInner: { x: 75, y: 40 },
    innerCorner: { x: 100, y: 50 },
    lowerInner: { x: 75, y: 60 },
    lowerOuter: { x: 25, y: 60 },
  };
}

function normalizedEye(): EyelidLandmarks {
  return {
    outerCorner: { x: 0, y: 0.5 },
    upperOuter: { x: 0.125, y: 0.4 },
    upperInner: { x: 0.375, y: 0.4 },
    innerCorner: { x: 0.5, y: 0.5 },
    lowerInner: { x: 0.375, y: 0.6 },
    lowerOuter: { x: 0.125, y: 0.6 },
  };
}

describe('geometria palpebrale N03', () => {
  it('calcola il rapporto EAR dai punti in pixel', () => {
    const observation = calculateEyeGeometry(
      'left',
      pixelEye(),
      { width: 200, height: 100 },
      'pixels',
    );

    expect(observation.valid).toBe(true);
    expect(observation.eyeAspectRatio).toBeCloseTo(0.2, 12);
    expect(observation.horizontalWidthPx).toBeCloseTo(100, 12);
    expect(observation.invalidityReasons).toEqual([]);
  });

  it('corregge le scale di un’immagine non quadrata con punti normalizzati', () => {
    const normalized = calculateEyeGeometry(
      'left',
      normalizedEye(),
      { width: 200, height: 100 },
      'normalized',
    );
    const pixels = calculateEyeGeometry(
      'left',
      pixelEye(),
      { width: 200, height: 100 },
      'pixels',
    );

    expect(normalized.valid).toBe(true);
    expect(normalized.eyeAspectRatio).not.toBeNull();
    expect(normalized.eyeAspectRatio).toBeCloseTo(pixels.eyeAspectRatio ?? 0, 12);
    expect(normalized.eyeAspectRatio).toBeCloseTo(0.2, 12);
  });

  it('rifiuta punti fuori dall’immagine', () => {
    const eye: EyelidLandmarks = {
      ...normalizedEye(),
      upperOuter: { x: 0.125, y: 1.2 },
    };

    const observation = calculateEyeGeometry(
      'left',
      eye,
      { width: 200, height: 100 },
      'normalized',
    );

    expect(observation.valid).toBe(false);
    expect(observation).not.toHaveProperty('eyeAspectRatio');
    expect(observation.invalidityReasons).toContain('out_of_range');
  });

  it('rifiuta occhi troppo stretti o rapporti implausibili', () => {
    const eye: EyelidLandmarks = {
      outerCorner: { x: 50, y: 50 },
      upperOuter: { x: 51, y: 49 },
      upperInner: { x: 52, y: 49 },
      innerCorner: { x: 53, y: 50 },
      lowerInner: { x: 52, y: 51 },
      lowerOuter: { x: 51, y: 51 },
    };

    const narrow = calculateEyeGeometry(
      'left',
      eye,
      { width: 100, height: 100 },
      'pixels',
    );
    expect(narrow.valid).toBe(false);
    expect(narrow.invalidityReasons).toContain('geometry_invalid');

    const plausible = calculateEyeGeometry(
      'left',
      pixelEye(),
      { width: 200, height: 100 },
      'pixels',
      { maxEyeAspectRatio: 0.1 },
    );
    expect(plausible.valid).toBe(false);
    expect(plausible.invalidityReasons).toContain('geometry_invalid');
  });

  it('calcola entrambi gli occhi e conserva i metadati', () => {
    const right: EyelidLandmarks = {
      ...pixelEye(),
      upperOuter: { x: 25, y: -20 },
    };

    const observation = calculateFaceGeometry({
      timestampMs: 1000,
      imageWidth: 200,
      imageHeight: 100,
      coordinateSpace: 'pixels',
      left: pixelEye(),
      right,
    });

    expect(observation.methodVersion).toBe(GEOMETRY_METHOD_VERSION);
    expect(observation.imageWidth).toBe(200);
    expect(observation.imageHeight).toBe(100);
    expect(observation.left.valid).toBe(true);
    expect(observation.right.valid).toBe(false);
    expect(observation.right.invalidityReasons).toContain('out_of_range');
  });

  it('valida la configurazione geometrica', () => {
    expect(resolveGeometryConfig({ minEyeWidthPx: 4 }).configId).toContain(
      'minEyeWidthPx=4',
    );
    expect(() => resolveGeometryConfig({ minEyeWidthPx: 0 })).toThrow(
      GeometryConfigError,
    );
    expect(() => resolveGeometryConfig({ maxEyeAspectRatio: 0 })).toThrow(
      GeometryConfigError,
    );
  });
});
