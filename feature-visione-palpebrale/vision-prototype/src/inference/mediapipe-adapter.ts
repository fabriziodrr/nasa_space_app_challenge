import { resolveGeometryConfig } from '../analysis/geometry';
import type { ResolvedGeometryConfig } from '../analysis/geometry';
import type { InferenceFrame } from '../contracts/frame';
import type {
  InferenceProcessResult,
  InferenceProvenance,
  InferenceStatus,
  InferenceStatusSnapshot,
} from '../contracts/inference';
import { convertFaceLandmarkerResult } from './convert';
import {
  INFERENCE_PROVENANCE,
  createMediaPipeRuntime,
} from './mediapipe-runtime';
import type {
  FaceLandmarkerResultLike,
  FaceLandmarkerRuntime,
  FaceLandmarkerRuntimeFactory,
  FrameCancellation,
  InferenceErrorCode,
  MediaPipeAdapterConfig,
  ResolvedMediaPipeAdapterConfig,
} from './types';

const NOT_ABORTED: FrameCancellation = Object.freeze({ aborted: false });

export class InferenceError extends Error {
  readonly code: InferenceErrorCode;

  constructor(code: InferenceErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'InferenceError';
    this.code = code;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

export interface MediaPipeAdapterOptions {
  /**
   * Runtime iniettabile. Il valore predefinito carica
   * `@mediapipe/tasks-vision` e il modello locale.
   */
  readonly runtimeFactory?: FaceLandmarkerRuntimeFactory;
}

function localAssetPath(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new InferenceError(
      'invalid_configuration',
      `${label} deve essere una stringa.`,
    );
  }

  const path = value.trim();

  if (path.length === 0) {
    throw new InferenceError(
      'invalid_configuration',
      `${label} non può essere vuoto.`,
    );
  }

  if (
    /^[a-z][a-z\d+.-]*:/i.test(path) ||
    path.startsWith('//') ||
    path.includes('\\')
  ) {
    throw new InferenceError(
      'invalid_configuration',
      `${label} deve essere un percorso locale al server.`,
    );
  }

  return path;
}

function confidence(value: unknown, fallback: number, label: string): number {
  const resolved = value === undefined ? fallback : value;

  if (
    typeof resolved !== 'number' ||
    !Number.isFinite(resolved) ||
    resolved < 0 ||
    resolved > 1
  ) {
    throw new InferenceError(
      'invalid_configuration',
      `${label} deve essere compreso tra 0 e 1.`,
    );
  }

  return resolved;
}

function positiveInteger(value: unknown, fallback: number, label: string): number {
  const resolved = value === undefined ? fallback : value;

  if (
    typeof resolved !== 'number' ||
    !Number.isInteger(resolved) ||
    resolved < 1 ||
    resolved > 4
  ) {
    throw new InferenceError(
      'invalid_configuration',
      `${label} deve essere un intero tra 1 e 4.`,
    );
  }

  return resolved;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === 'string' ? error : 'Error sconosciuto.';
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** Valida la configurazione e risolve la geometria N03. */
export function resolveMediaPipeAdapterConfig(
  input: MediaPipeAdapterConfig,
): ResolvedMediaPipeAdapterConfig {
  if (typeof input !== 'object' || input === null) {
    throw new InferenceError(
      'invalid_configuration',
      'La configurazione dell’adattatore deve essere un oggetto.',
    );
  }

  const modelAssetPath = localAssetPath(input.modelAssetPath, 'modelAssetPath');
  let wasmAssetPath = localAssetPath(input.wasmAssetPath, 'wasmAssetPath');

  if (!wasmAssetPath.endsWith('/')) {
    wasmAssetPath = `${wasmAssetPath}/`;
  }

  const delegate = input.delegate ?? 'CPU';

  if (delegate !== 'CPU' && delegate !== 'GPU') {
    throw new InferenceError(
      'invalid_configuration',
      'delegate deve essere CPU o GPU.',
    );
  }

  let geometry: ResolvedGeometryConfig;

  try {
    geometry = resolveGeometryConfig(input.geometry ?? {});
  } catch (error) {
    throw new InferenceError(
      'invalid_configuration',
      `Configurazione geometrica non valida: ${errorMessage(error)}`,
      error,
    );
  }

  const numFaces = positiveInteger(input.numFaces, 2, 'numFaces');
  const minFaceDetectionConfidence = confidence(
    input.minFaceDetectionConfidence,
    0.5,
    'minFaceDetectionConfidence',
  );
  const minFacePresenceConfidence = confidence(
    input.minFacePresenceConfidence,
    0.5,
    'minFacePresenceConfidence',
  );
  const minTrackingConfidence = confidence(
    input.minTrackingConfidence,
    0.5,
    'minTrackingConfidence',
  );
  const configId = [
    'n04-mediapipe-v1',
    `delegate=${delegate}`,
    `numFaces=${numFaces}`,
    geometry.configId,
  ].join('|');

  return Object.freeze({
    modelAssetPath,
    wasmAssetPath,
    delegate,
    numFaces,
    minFaceDetectionConfidence,
    minFacePresenceConfidence,
    minTrackingConfidence,
    geometry,
    configId,
  });
}

/**
 * Adattatore MediaPipe Face Landmarker.
 *
 * Il ciclo di vita è esplicito: `init()` carica modello e WASM, `processFrame()`
 * converte un fotogramma, `release()` chiude il runtime. L'adattatore non usa
 * React e non gestisce la webcam; il timestamp e l'annullamento arrivano dal
 * frame di T03.
 */
export class MediaPipeFaceLandmarkerAdapter {
  private readonly config: ResolvedMediaPipeAdapterConfig;
  private readonly runtimeFactory: FaceLandmarkerRuntimeFactory;
  private runtime: FaceLandmarkerRuntime | null = null;
  private status: InferenceStatus = 'idle';
  private initPromise: Promise<void> | null = null;
  private generation = 0;
  private lastTimestampMs: number | null = null;
  private frameCount = 0;
  private lastFaceCount: number | null = null;
  private lastError: string | null = null;

  constructor(
    config: MediaPipeAdapterConfig,
    options: MediaPipeAdapterOptions = {},
  ) {
    this.config = resolveMediaPipeAdapterConfig(config);
    this.runtimeFactory = options.runtimeFactory ?? createMediaPipeRuntime;
  }

  /** Configurazione validata, utile per log tecnici e test. */
  getConfig(): ResolvedMediaPipeAdapterConfig {
    return this.config;
  }

  getStatus(): InferenceStatusSnapshot {
    return Object.freeze({
      status: this.status,
      initialized: this.runtime !== null,
      frameCount: this.frameCount,
      lastFaceCount: this.lastFaceCount,
      lastError: this.lastError,
    });
  }

  getProvenance(): InferenceProvenance {
    return Object.freeze({
      ...INFERENCE_PROVENANCE,
      delegate: this.config.delegate,
      numFaces: this.config.numFaces,
      configId: this.config.configId,
    });
  }

  /**
   * Carica il runtime. Chiamate concorrenti condividono la stessa Promise.
   * Dopo `release()` l'adattatore può essere inizializzato di nuovo.
   */
  async init(): Promise<void> {
    if (this.status === 'ready' && this.runtime !== null) {
      return;
    }

    if (this.initPromise !== null) {
      return this.initPromise;
    }

    const generation = this.generation;
    this.status = 'initializing';
    this.lastError = null;

    const promise = (async () => {
      try {
        const runtime = await this.runtimeFactory(this.config);

        if (generation !== this.generation) {
          runtime.close();
          return;
        }

        this.runtime = runtime;
        this.status = 'ready';
        this.lastTimestampMs = null;
        this.frameCount = 0;
        this.lastFaceCount = null;
      } catch (error) {
        if (generation === this.generation) {
          this.status = 'error';
          this.lastError = errorMessage(error);
        }

        throw new InferenceError(
          'runtime_load_failed',
          'Impossibile caricare modello o runtime MediaPipe.',
          error,
        );
      }
    })();

    this.initPromise = promise;

    try {
      await promise;
    } finally {
      if (this.initPromise === promise) {
        this.initPromise = null;
      }
    }
  }

  /**
   * Elabora un fotogramma.
   *
   * Un segnale già annullato restituisce `cancelled` senza chiamare il runtime.
   * Timestamp non crescenti o frame malformati lanciano `InferenceError`.
   */
  processFrame(
    frame: InferenceFrame,
    signal: FrameCancellation = NOT_ABORTED,
  ): InferenceProcessResult {
    if (this.status !== 'ready' || this.runtime === null) {
      throw new InferenceError(
        'not_initialized',
        'L’adattatore non è inizializzato: chiamare init().',
      );
    }

    if (frame === null || typeof frame !== 'object') {
      throw new InferenceError(
        'invalid_frame',
        'Il fotogramma deve essere un oggetto.',
      );
    }

    if (
      !isPositiveFinite(frame.width) ||
      !isPositiveFinite(frame.height) ||
      !Number.isFinite(frame.timestampMs) ||
      frame.timestampMs < 0
    ) {
      throw new InferenceError(
        'invalid_frame',
        'Il fotogramma deve avere dimensioni e timestamp validi.',
      );
    }

    let pixels: InferenceFrame['pixels'];

    try {
      pixels = frame.pixels;
    } catch (error) {
      throw new InferenceError(
        'invalid_frame',
        'Il buffer RGBA del fotogramma non è più disponibile.',
        error,
      );
    }

    if (
      pixels === null ||
      pixels === undefined ||
      pixels.format !== 'rgba8' ||
      !(pixels.data instanceof Uint8ClampedArray) ||
      pixels.data.length !== frame.width * frame.height * 4
    ) {
      throw new InferenceError(
        'invalid_frame',
        'Il fotogramma deve avere un buffer RGBA coerente con le dimensioni.',
      );
    }

    if (signal.aborted) {
      return Object.freeze({
        status: 'cancelled' as const,
        timestampMs: frame.timestampMs,
      });
    }

    if (
      this.lastTimestampMs !== null &&
      frame.timestampMs <= this.lastTimestampMs
    ) {
      throw new InferenceError(
        'non_monotonic_timestamp',
        'Il timestamp del fotogramma deve essere strettamente crescente.',
      );
    }

    let result: FaceLandmarkerResultLike;

    try {
      result = this.runtime.detectForVideo(frame, frame.timestampMs);
    } catch (error) {
      throw new InferenceError(
        'runtime_error',
        'Error durante l’inferenza MediaPipe.',
        error,
      );
    }

    this.lastTimestampMs = frame.timestampMs;
    this.frameCount += 1;

    const inference = convertFaceLandmarkerResult(
      result,
      frame.timestampMs,
      frame.width,
      frame.height,
      this.config.geometry,
    );

    this.lastFaceCount = inference.faceCount;

    return inference;
  }

  /**
   * Chiude il runtime e annulla un eventuale caricamento in corso.
   * Un caricamento che termina dopo `release()` viene chiuso senza essere usato.
   */
  release(): void {
    this.generation += 1;
    const runtime = this.runtime;
    this.runtime = null;
    this.status = 'released';
    this.initPromise = null;
    this.lastTimestampMs = null;
    this.lastFaceCount = null;

    if (runtime !== null) {
      try {
        runtime.close();
      } catch {
        // Il rilascio non deve nascondere lo stato già pubblicato.
      }
    }
  }
}
