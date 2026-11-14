import { GEOMETRY_METHOD_VERSION } from '../analysis/geometry';
import type { InferenceProvenance } from '../contracts/inference';
import type {
  FaceLandmarkerRuntime,
  FaceLandmarkerRuntimeFactory,
  ResolvedMediaPipeAdapterConfig,
} from './types';

/**
 * Versione del pacchetto npm fissata nel lockfile.
 * Il valore va aggiornato solo con una nuova verifica di N04/T06.
 */
export const MEDIAPIPE_RUNTIME_VERSION = '1.2.3';

/**
 * Modello selezionato per Face Landmarker.
 *
 * Provenienza e checksum sono verificabili: il file in
 * `public/models/face_landmarker.task` deve avere la stessa dimensione e SHA-256.
 * La licenza Apache-2.0 è la stessa del progetto MediaPipe; le condizioni
 * complete sono nel repository ufficiale.
 */
export const FACE_LANDMARKER_MODEL = Object.freeze({
  name: 'MediaPipe Face Landmarker (float16)',
  version: '1',
  id: 'face_landmarker/float16/1/face_landmarker.task',
  sha256: '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff',
  sizeBytes: 3_758_596,
  license: 'Apache-2.0',
  source:
    'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
});

export const MEDIAPIPE_RUNTIME_SOURCE =
  'https://www.npmjs.com/package/@mediapipe/tasks-vision/v/1.2.3';

export const MEDIAPIPE_RUNTIME_LICENSE = 'Apache-2.0';

/**
 * Provenienza stabile dell'adattatore. Le impostazioni operative sono incluse
 * da `getProvenance` nell'adattatore, che aggiunge delegate e numero di volti.
 */
export const INFERENCE_PROVENANCE = Object.freeze({
  adapterVersion: 'n04-mediapipe-adapter-v1',
  runtime: 'MediaPipe Tasks Vision',
  runtimeVersion: MEDIAPIPE_RUNTIME_VERSION,
  runtimeLicense: MEDIAPIPE_RUNTIME_LICENSE,
  runtimeSource: MEDIAPIPE_RUNTIME_SOURCE,
  model: FACE_LANDMARKER_MODEL.name,
  modelVersion: FACE_LANDMARKER_MODEL.version,
  modelId: FACE_LANDMARKER_MODEL.id,
  modelSha256: FACE_LANDMARKER_MODEL.sha256,
  modelSizeBytes: FACE_LANDMARKER_MODEL.sizeBytes,
  modelLicense: FACE_LANDMARKER_MODEL.license,
  modelSource: FACE_LANDMARKER_MODEL.source,
  geometryMethodVersion: GEOMETRY_METHOD_VERSION,
} satisfies Omit<InferenceProvenance, 'delegate' | 'numFaces' | 'configId'>);

/**
 * Crea il runtime reale. L'import dinamico evita di caricare il bundle MediaPipe
 * nei test e permette di riutilizzare l'adattatore con un runtime iniettato.
 */
export const createMediaPipeRuntime: FaceLandmarkerRuntimeFactory = async (
  config: ResolvedMediaPipeAdapterConfig,
): Promise<FaceLandmarkerRuntime> => {
  const vision = await import('@mediapipe/tasks-vision');
  const fileset = await vision.FilesetResolver.forVisionTasks(config.wasmAssetPath);
  const landmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: config.modelAssetPath,
      delegate: config.delegate,
    },
    runningMode: 'VIDEO',
    numFaces: config.numFaces,
    minFaceDetectionConfidence: config.minFaceDetectionConfidence,
    minFacePresenceConfidence: config.minFacePresenceConfidence,
    minTrackingConfidence: config.minTrackingConfidence,
  });

  return {
    detectForVideo: (frame, timestampMs) => {
      // C01 consegna RGBA: MediaPipe accetta ImageData come sorgente immagine.
      const image = new ImageData(
        frame.pixels.data,
        frame.width,
        frame.height,
      );
      return landmarker.detectForVideo(image, timestampMs);
    },
    close: () => landmarker.close(),
  };
};
