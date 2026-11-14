import type { GeometryConfigInput, ResolvedGeometryConfig } from '../analysis/geometry';
import type { InferenceFrame } from '../contracts/frame';

export type MediaPipeDelegate = 'CPU' | 'GPU';

/** Segnale minimo compatibile con `AbortSignal` e con il consumer C01. */
export interface FrameCancellation {
  readonly aborted: boolean;
}

export interface MediaPipeAdapterConfig {
  /** Percorso locale del modello `.task`. */
  readonly modelAssetPath: string;
  /** Directory locale che contiene i file WASM di Tasks Vision. */
  readonly wasmAssetPath: string;
  readonly delegate?: MediaPipeDelegate;
  /** Numero massimo di volti da rilevare; 2 permette di riconoscere l'ambiguità. */
  readonly numFaces?: number;
  readonly minFaceDetectionConfidence?: number;
  readonly minFacePresenceConfidence?: number;
  readonly minTrackingConfidence?: number;
  readonly geometry?: GeometryConfigInput;
}

export interface ResolvedMediaPipeAdapterConfig {
  readonly modelAssetPath: string;
  readonly wasmAssetPath: string;
  readonly delegate: MediaPipeDelegate;
  readonly numFaces: number;
  readonly minFaceDetectionConfidence: number;
  readonly minFacePresenceConfidence: number;
  readonly minTrackingConfidence: number;
  readonly geometry: ResolvedGeometryConfig;
  readonly configId: string;
}

/** Landmark normalizzato minimo, compatibile con `NormalizedLandmark`. */
export interface NormalizedLandmarkLike {
  readonly x: number;
  readonly y: number;
}

/** Risultato minimo di `FaceLandmarker.detectForVideo`. */
export interface FaceLandmarkerResultLike {
  readonly faceLandmarks: readonly (readonly NormalizedLandmarkLike[])[];
}

/**
 * Runtime iniettabile.
 *
 * Il valore predefinito usa `@mediapipe/tasks-vision`; i test possono fornire
 * un'implementazione finta senza caricare WASM o modello.
 */
export interface FaceLandmarkerRuntime {
  detectForVideo(
    frame: InferenceFrame,
    timestampMs: number,
  ): FaceLandmarkerResultLike;
  close(): void;
}

export type FaceLandmarkerRuntimeFactory = (
  config: ResolvedMediaPipeAdapterConfig,
) => Promise<FaceLandmarkerRuntime>;

export type InferenceErrorCode =
  | 'invalid_configuration'
  | 'not_initialized'
  | 'runtime_load_failed'
  | 'runtime_error'
  | 'invalid_frame'
  | 'non_monotonic_timestamp';
