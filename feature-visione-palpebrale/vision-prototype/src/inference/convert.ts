import {
  GEOMETRY_METHOD_VERSION,
  MEDIAPIPE_FACE_MESH_EYELID_INDICES,
  calculateFaceGeometry,
} from '../analysis/geometry';
import type { GeometryConfigInput } from '../analysis/geometry';
import type { FaceInferenceResult } from '../contracts/inference';
import type {
  EyelidLandmarks,
  EyeGeometryObservation,
  FaceGeometryObservation,
  Point2D,
} from '../contracts/geometry';
import type { EyeInvalidityReason, EyeSide } from '../contracts/sample';
import type {
  FaceLandmarkerResultLike,
  NormalizedLandmarkLike,
} from './types';

function invalidEye(
  side: EyeSide,
  reasons: readonly EyeInvalidityReason[],
): EyeGeometryObservation {
  const unique = [...new Set(reasons)];
  const [first = 'unknown', ...rest] = unique;

  return Object.freeze({
    side,
    horizontalWidthPx: 0,
    valid: false,
    invalidityReasons: Object.freeze([
      first,
      ...rest,
    ] as [EyeInvalidityReason, ...EyeInvalidityReason[]]),
  });
}

function invalidFace(
  timestampMs: number,
  imageWidth: number,
  imageHeight: number,
  reasons: readonly EyeInvalidityReason[],
): FaceGeometryObservation {
  return Object.freeze({
    timestampMs,
    methodVersion: GEOMETRY_METHOD_VERSION,
    imageWidth,
    imageHeight,
    left: invalidEye('left', reasons),
    right: invalidEye('right', reasons),
  });
}

function pointAt(
  face: readonly NormalizedLandmarkLike[],
  index: number,
): Point2D | null {
  const point = face[index];

  if (
    point === undefined ||
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y)
  ) {
    return null;
  }

  return { x: point.x, y: point.y };
}

function readEye(
  face: readonly NormalizedLandmarkLike[],
  side: EyeSide,
): EyelidLandmarks | null {
  const indices = MEDIAPIPE_FACE_MESH_EYELID_INDICES[side];
  const outerCorner = pointAt(face, indices.outerCorner);
  const upperOuter = pointAt(face, indices.upperOuter);
  const upperInner = pointAt(face, indices.upperInner);
  const innerCorner = pointAt(face, indices.innerCorner);
  const lowerInner = pointAt(face, indices.lowerInner);
  const lowerOuter = pointAt(face, indices.lowerOuter);

  if (
    outerCorner === null ||
    upperOuter === null ||
    upperInner === null ||
    innerCorner === null ||
    lowerInner === null ||
    lowerOuter === null
  ) {
    return null;
  }

  return {
    outerCorner,
    upperOuter,
    upperInner,
    innerCorner,
    lowerInner,
    lowerOuter,
  };
}

/**
 * Converte l'uscita di Face Landmarker nella geometria N03.
 *
 * - nessun volto: entrambi gli occhi invalidi con `not_tracked`;
 * - più volti: osservazione ambigua, nessun volto scelto arbitrariamente;
 * - landmark mancanti o non ammissibili: occhi invalidi con motivo esplicito;
 * - un solo volto: EAR per occhio, con eventuale validità parziale.
 *
 * La conversione è pura e non richiede DOM, quindi può essere riusata in un
 * Web Worker.
 */
export function convertFaceLandmarkerResult(
  result: FaceLandmarkerResultLike,
  timestampMs: number,
  imageWidth: number,
  imageHeight: number,
  geometryConfig: GeometryConfigInput = {},
): FaceInferenceResult {
  const faces = Array.isArray(result?.faceLandmarks)
    ? result.faceLandmarks
    : [];
  const faceCount = faces.length;

  if (faceCount === 0) {
    return Object.freeze({
      status: 'no_face',
      timestampMs,
      faceCount,
      geometry: invalidFace(timestampMs, imageWidth, imageHeight, ['not_tracked']),
      message: 'No face detected.',
    });
  }

  if (faceCount > 1) {
    return Object.freeze({
      status: 'ambiguous',
      timestampMs,
      faceCount,
      geometry: invalidFace(timestampMs, imageWidth, imageHeight, [
        'ambiguous_face',
      ]),
      message: 'Multiple faces detected: ambiguous observation.',
    });
  }

  const face = faces[0];

  if (face === undefined) {
    return Object.freeze({
      status: 'no_face',
      timestampMs,
      faceCount: 0,
      geometry: invalidFace(timestampMs, imageWidth, imageHeight, ['not_tracked']),
      message: 'No face detected.',
    });
  }

  const left = readEye(face, 'left');
  const right = readEye(face, 'right');

  if (left === null || right === null) {
    return Object.freeze({
      status: 'invalid_landmarks',
      timestampMs,
      faceCount,
      geometry: invalidFace(timestampMs, imageWidth, imageHeight, [
        'landmark_missing',
      ]),
      message: 'Incomplete eyelid landmarks.',
    });
  }

  const geometry = calculateFaceGeometry(
    {
      timestampMs,
      imageWidth,
      imageHeight,
      coordinateSpace: 'normalized',
      left,
      right,
    },
    geometryConfig,
  );

  if (!geometry.left.valid && !geometry.right.valid) {
    return Object.freeze({
      status: 'invalid_landmarks',
      timestampMs,
      faceCount,
      geometry,
      message: 'Invalid eyelid landmarks.',
    });
  }

  return Object.freeze({
    status: 'face',
    timestampMs,
    faceCount,
    geometry,
    landmarks: Object.freeze({ left, right }),
    message:
      geometry.left.valid && geometry.right.valid
        ? 'Face detected.'
        : 'Face detected; one eye is not usable.',
  });
}
