import type {
  EyelidLandmarks,
  EyeGeometryObservation,
  FaceGeometryObservation,
  FaceLandmarks,
  GeometryCoordinateSpace,
  ImageDimensions,
  Point2D,
} from '../contracts/geometry';
import type { EyeInvalidityReason, EyeSide } from '../contracts/sample';

export const GEOMETRY_METHOD_VERSION = 'n03-ear-v1';

/**
 * Configurazione dei controlli geometrici.
 *
 * `minEyeWidthPx` evita rapporti instabili su occhi molto piccoli.
 * `maxEyeAspectRatio` intercetta landmark collassati o associati male.
 * `coordinateTolerancePx` assorbe piccole uscite dal bordo dell'immagine.
 */
export interface GeometryConfigValues {
  readonly minEyeWidthPx: number;
  readonly maxEyeAspectRatio: number;
  readonly coordinateTolerancePx: number;
}

export interface GeometryConfigInput {
  readonly minEyeWidthPx?: number;
  readonly maxEyeAspectRatio?: number;
  readonly coordinateTolerancePx?: number;
}

export interface ResolvedGeometryConfig extends GeometryConfigValues {
  readonly configId: string;
}

export const DEFAULT_GEOMETRY_CONFIG: Readonly<GeometryConfigValues> = Object.freeze({
  minEyeWidthPx: 8,
  maxEyeAspectRatio: 1.2,
  coordinateTolerancePx: 1,
});

export class GeometryConfigError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Configurazione geometrica non valida: ${issues.join('; ')}`);
    this.name = 'GeometryConfigError';
    this.issues = Object.freeze([...issues]);
  }
}

export function resolveGeometryConfig(
  input: GeometryConfigInput = {},
): ResolvedGeometryConfig {
  const values: GeometryConfigValues = {
    minEyeWidthPx: input.minEyeWidthPx ?? DEFAULT_GEOMETRY_CONFIG.minEyeWidthPx,
    maxEyeAspectRatio:
      input.maxEyeAspectRatio ?? DEFAULT_GEOMETRY_CONFIG.maxEyeAspectRatio,
    coordinateTolerancePx:
      input.coordinateTolerancePx ?? DEFAULT_GEOMETRY_CONFIG.coordinateTolerancePx,
  };

  const issues: string[] = [];

  if (!Number.isFinite(values.minEyeWidthPx) || values.minEyeWidthPx <= 0) {
    issues.push('minEyeWidthPx deve essere finito e maggiore di 0');
  }
  if (!Number.isFinite(values.maxEyeAspectRatio) || values.maxEyeAspectRatio <= 0) {
    issues.push('maxEyeAspectRatio deve essere finito e maggiore di 0');
  }
  if (!Number.isFinite(values.coordinateTolerancePx) || values.coordinateTolerancePx < 0) {
    issues.push('coordinateTolerancePx deve essere finito e non negativo');
  }

  if (issues.length > 0) {
    throw new GeometryConfigError(issues);
  }

  const configId = [
    'n03-geometry-v1',
    `minEyeWidthPx=${values.minEyeWidthPx}`,
    `maxEyeAspectRatio=${values.maxEyeAspectRatio}`,
    `coordinateTolerancePx=${values.coordinateTolerancePx}`,
  ].join('|');

  return Object.freeze({ ...values, configId });
}

/**
 * Indici consigliati di MediaPipe Face Mesh per i sei punti usati da N03.
 *
 * `left` e `right` indicano l'occhio della persona. N04 deve verificare che il
 * modello scelto usi la stessa numerazione e documentare l'eventuale mappatura
 * alternativa. N03 non importa la libreria MediaPipe.
 */
export interface EyelidLandmarkIndices {
  readonly outerCorner: number;
  readonly upperOuter: number;
  readonly upperInner: number;
  readonly innerCorner: number;
  readonly lowerInner: number;
  readonly lowerOuter: number;
}

function frozenIndices(indices: EyelidLandmarkIndices): EyelidLandmarkIndices {
  return Object.freeze({ ...indices });
}

export const MEDIAPIPE_FACE_MESH_EYELID_INDICES: Readonly<
  Record<EyeSide, EyelidLandmarkIndices>
> = Object.freeze({
  right: frozenIndices({
    outerCorner: 33,
    upperOuter: 160,
    upperInner: 158,
    innerCorner: 133,
    lowerInner: 153,
    lowerOuter: 144,
  }),
  left: frozenIndices({
    outerCorner: 362,
    upperOuter: 385,
    upperInner: 387,
    innerCorner: 263,
    lowerInner: 373,
    lowerOuter: 380,
  }),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFinitePoint(value: unknown): value is Point2D {
  return (
    isRecord(value) &&
    typeof value.x === 'number' &&
    Number.isFinite(value.x) &&
    typeof value.y === 'number' &&
    Number.isFinite(value.y)
  );
}

function toPixelPoint(
  value: unknown,
  image: ImageDimensions,
  coordinateSpace: GeometryCoordinateSpace,
): Point2D | null {
  if (!isFinitePoint(value)) {
    return null;
  }

  if (coordinateSpace === 'normalized') {
    return { x: value.x * image.width, y: value.y * image.height };
  }

  if (coordinateSpace === 'pixels') {
    return { x: value.x, y: value.y };
  }

  return null;
}

function distance(first: Point2D, second: Point2D): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function uniqueReasons(
  reasons: readonly EyeInvalidityReason[],
): readonly EyeInvalidityReason[] {
  return Object.freeze([...new Set(reasons)]);
}

function invalidObservation(
  side: EyeSide,
  reasons: readonly EyeInvalidityReason[],
  horizontalWidthPx = 0,
): EyeGeometryObservation {
  return Object.freeze({
    side,
    horizontalWidthPx: Number.isFinite(horizontalWidthPx)
      ? Math.max(0, horizontalWidthPx)
      : 0,
    valid: false,
    invalidityReasons: Object.freeze([
      reasons[0] ?? 'geometry_invalid', ...uniqueReasons(reasons).slice(1),
    ] as [EyeInvalidityReason, ...EyeInvalidityReason[]]),
  });
}

function calculateEyeGeometryResolved(
  side: EyeSide,
  landmarks: EyelidLandmarks,
  image: ImageDimensions,
  coordinateSpace: GeometryCoordinateSpace,
  config: ResolvedGeometryConfig,
): EyeGeometryObservation {
  if (
    !Number.isFinite(image.width) ||
    !Number.isFinite(image.height) ||
    image.width <= 0 ||
    image.height <= 0
  ) {
    return invalidObservation(side, ['geometry_invalid']);
  }

  if (!isRecord(landmarks)) {
    return invalidObservation(side, ['landmark_missing']);
  }

  const outerCorner = toPixelPoint(landmarks.outerCorner, image, coordinateSpace);
  const upperOuter = toPixelPoint(landmarks.upperOuter, image, coordinateSpace);
  const upperInner = toPixelPoint(landmarks.upperInner, image, coordinateSpace);
  const innerCorner = toPixelPoint(landmarks.innerCorner, image, coordinateSpace);
  const lowerInner = toPixelPoint(landmarks.lowerInner, image, coordinateSpace);
  const lowerOuter = toPixelPoint(landmarks.lowerOuter, image, coordinateSpace);

  if (
    outerCorner === null ||
    upperOuter === null ||
    upperInner === null ||
    innerCorner === null ||
    lowerInner === null ||
    lowerOuter === null
  ) {
    return invalidObservation(
      side,
      coordinateSpace === 'normalized' || coordinateSpace === 'pixels'
        ? ['landmark_missing']
        : ['geometry_invalid'],
    );
  }

  const points = [outerCorner, upperOuter, upperInner, innerCorner, lowerInner, lowerOuter];
  const tolerance = config.coordinateTolerancePx;
  const outsideImage = points.some(
    (point) =>
      point.x < -tolerance ||
      point.x > image.width + tolerance ||
      point.y < -tolerance ||
      point.y > image.height + tolerance,
  );

  if (outsideImage) {
    return invalidObservation(side, ['out_of_range']);
  }

  const horizontalWidthPx = distance(outerCorner, innerCorner);
  const verticalOuterPx = distance(upperOuter, lowerOuter);
  const verticalInnerPx = distance(upperInner, lowerInner);

  if (
    !Number.isFinite(horizontalWidthPx) ||
    !Number.isFinite(verticalOuterPx) ||
    !Number.isFinite(verticalInnerPx) ||
    horizontalWidthPx <= config.minEyeWidthPx
  ) {
    return invalidObservation(side, ['geometry_invalid'], horizontalWidthPx);
  }

  const eyeAspectRatio =
    (verticalOuterPx + verticalInnerPx) / (2 * horizontalWidthPx);

  if (
    !Number.isFinite(eyeAspectRatio) ||
    eyeAspectRatio < 0 ||
    eyeAspectRatio > config.maxEyeAspectRatio
  ) {
    return invalidObservation(side, ['geometry_invalid'], horizontalWidthPx);
  }

  return Object.freeze({
    side,
    eyeAspectRatio,
    horizontalWidthPx,
    valid: true,
    invalidityReasons: Object.freeze([] as const),
  });
}

/**
 * Calcola il rapporto palpebrale di un occhio.
 *
 * La formula è `EAR = (d(p2, p6) + d(p3, p5)) / (2 * d(p1, p4))` in pixel.
 * La conversione da coordinate normalizzate usa larghezza e altezza
 * dell'immagine, quindi corregge anche immagini non quadrate.
 */
export function calculateEyeGeometry(
  side: EyeSide,
  landmarks: EyelidLandmarks,
  image: ImageDimensions,
  coordinateSpace: GeometryCoordinateSpace,
  config: GeometryConfigInput = {},
): EyeGeometryObservation {
  return calculateEyeGeometryResolved(
    side,
    landmarks,
    image,
    coordinateSpace,
    resolveGeometryConfig(config),
  );
}

/** Calcola la geometria dei due occhi con la stessa configurazione. */
export function calculateFaceGeometry(
  landmarks: FaceLandmarks,
  config: GeometryConfigInput = {},
): FaceGeometryObservation {
  const resolved = resolveGeometryConfig(config);
  const image: ImageDimensions = {
    width: landmarks.imageWidth,
    height: landmarks.imageHeight,
  };

  return Object.freeze({
    timestampMs: landmarks.timestampMs,
    methodVersion: GEOMETRY_METHOD_VERSION,
    imageWidth: landmarks.imageWidth,
    imageHeight: landmarks.imageHeight,
    left: calculateEyeGeometryResolved(
      'left',
      landmarks.left,
      image,
      landmarks.coordinateSpace,
      resolved,
    ),
    right: calculateEyeGeometryResolved(
      'right',
      landmarks.right,
      image,
      landmarks.coordinateSpace,
      resolved,
    ),
  });
}
