import type { EyelidLandmarks, FaceGeometryObservation } from './geometry';

/** Esito della ricerca del volto per un fotogramma. */
export type FaceDetectionStatus =
  | 'face'
  | 'no_face'
  | 'ambiguous'
  | 'invalid_landmarks';

/**
 * Risultato dell'adattatore per un fotogramma elaborato.
 *
 * `geometry` è sempre presente: quando non c'è un volto o i landmark non sono
 * ammissibili, entrambi gli occhi risultano invalidi con il motivo appropriato.
 * La UI e la calibrazione possono così distinguere dati mancanti da occhi
 * aperti senza inventare un valore numerico.
 */
export interface FaceInferenceResult {
  readonly status: FaceDetectionStatus;
  readonly timestampMs: number;
  readonly faceCount: number;
  readonly geometry: FaceGeometryObservation;
  readonly message: string;
  /** Punti normalizzati, disponibili solo quando entrambi i gruppi sono presenti. */
  readonly landmarks?: Readonly<{ left: EyelidLandmarks; right: EyelidLandmarks }>;
}

/** Un fotogramma annullato prima dell'inferenza non produce osservazioni. */
export interface InferenceCancelled {
  readonly status: 'cancelled';
  readonly timestampMs: number;
}

export type InferenceProcessResult = FaceInferenceResult | InferenceCancelled;

export type InferenceStatus =
  | 'idle'
  | 'initializing'
  | 'ready'
  | 'released'
  | 'error';

/** Provenienza degli asset e della geometria usati dall'adattatore. */
export interface InferenceProvenance {
  readonly adapterVersion: string;
  readonly runtime: string;
  readonly runtimeVersion: string;
  readonly runtimeLicense: string;
  readonly runtimeSource: string;
  readonly model: string;
  readonly modelVersion: string;
  readonly modelId: string;
  readonly modelSha256: string;
  readonly modelSizeBytes: number;
  readonly modelLicense: string;
  readonly modelSource: string;
  readonly geometryMethodVersion: string;
  readonly delegate: 'CPU' | 'GPU';
  readonly numFaces: number;
  readonly configId: string;
}

export interface InferenceStatusSnapshot {
  readonly status: InferenceStatus;
  readonly initialized: boolean;
  readonly frameCount: number;
  readonly lastFaceCount: number | null;
  readonly lastError: string | null;
}
