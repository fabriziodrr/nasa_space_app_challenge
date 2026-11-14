import { describe, expect, it, vi } from 'vitest';
import type { InferenceFrame } from '../contracts/frame';
import type {
  FaceLandmarkerResultLike,
  FaceLandmarkerRuntime,
  NormalizedLandmarkLike,
} from './types';
import { convertFaceLandmarkerResult } from './convert';
import {
  InferenceError,
  MediaPipeFaceLandmarkerAdapter,
  resolveMediaPipeAdapterConfig,
} from './mediapipe-adapter';
import {
  FACE_LANDMARKER_MODEL,
  MEDIAPIPE_RUNTIME_VERSION,
} from './mediapipe-runtime';

type PointMap = Readonly<Record<number, NormalizedLandmarkLike>>;

const RIGHT_OPEN: PointMap = {
  33: { x: 0, y: 0.5 },
  160: { x: 0.125, y: 0.4 },
  158: { x: 0.375, y: 0.4 },
  133: { x: 0.5, y: 0.5 },
  153: { x: 0.375, y: 0.6 },
  144: { x: 0.125, y: 0.6 },
};

const LEFT_OPEN: PointMap = {
  362: { x: 0, y: 0.5 },
  385: { x: 0.125, y: 0.4 },
  387: { x: 0.375, y: 0.4 },
  263: { x: 0.5, y: 0.5 },
  373: { x: 0.375, y: 0.6 },
  380: { x: 0.125, y: 0.6 },
};

const RIGHT_CLOSED: PointMap = {
  33: { x: 0, y: 0.5 },
  160: { x: 0.125, y: 0.48 },
  158: { x: 0.375, y: 0.48 },
  133: { x: 0.5, y: 0.5 },
  153: { x: 0.375, y: 0.52 },
  144: { x: 0.125, y: 0.52 },
};

const LEFT_CLOSED: PointMap = {
  362: { x: 0, y: 0.5 },
  385: { x: 0.125, y: 0.48 },
  387: { x: 0.375, y: 0.48 },
  263: { x: 0.5, y: 0.5 },
  373: { x: 0.375, y: 0.52 },
  380: { x: 0.125, y: 0.52 },
};

function faceWith(
  right: PointMap = RIGHT_OPEN,
  left: PointMap = LEFT_OPEN,
): NormalizedLandmarkLike[] {
  const face = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));

  for (const [index, point] of Object.entries({ ...right, ...left })) {
    face[Number(index)] = point;
  }

  return face;
}

function frame(
  timestampMs = 1000,
  overrides: Partial<InferenceFrame> = {},
): InferenceFrame {
  const width = 200;
  const height = 100;

  return {
    frameId: 1,
    timestampMs,
    width,
    height,
    pixels: {
      format: 'rgba8',
      data: new Uint8ClampedArray(width * height * 4),
    },
    source: 'webcam',
    release: vi.fn(),
    ...overrides,
  };
}

describe('conversione Face Landmarker → geometria N03', () => {
  it('converte i sei punti dell’occhio destro e sinistro', () => {
    const result = convertFaceLandmarkerResult(
      { faceLandmarks: [faceWith()] },
      1000,
      200,
      100,
    );

    expect(result.status).toBe('face');
    expect(result.faceCount).toBe(1);
    expect(result.geometry.left.valid).toBe(true);
    expect(result.geometry.right.valid).toBe(true);
    expect(result.geometry.left.eyeAspectRatio).toBeCloseTo(0.2, 12);
    expect(result.geometry.right.eyeAspectRatio).toBeCloseTo(0.2, 12);
    expect(result.geometry.methodVersion).toBe('n03-ear-v1');
    expect(result.geometry.imageWidth).toBe(200);
  });

  it('distingue occhio aperto e chiuso con la stessa geometria', () => {
    const open = convertFaceLandmarkerResult(
      { faceLandmarks: [faceWith()] },
      1,
      200,
      100,
    );
    const closed = convertFaceLandmarkerResult(
      { faceLandmarks: [faceWith(RIGHT_CLOSED, LEFT_CLOSED)] },
      2,
      200,
      100,
    );

    expect(open.geometry.left.eyeAspectRatio).toBeCloseTo(0.2, 12);
    expect(closed.geometry.left.eyeAspectRatio).toBeCloseTo(0.04, 12);
    expect(closed.geometry.right.eyeAspectRatio).toBeCloseTo(0.04, 12);
  });

  it('gestisce volto assente e landmark insufficienti', () => {
    const noFace = convertFaceLandmarkerResult(
      { faceLandmarks: [] },
      10,
      200,
      100,
    );
    expect(noFace.status).toBe('no_face');
    expect(noFace.faceCount).toBe(0);
    expect(noFace.geometry.left.valid).toBe(false);
    expect(noFace.geometry.left.invalidityReasons).toEqual(['not_tracked']);

    const shortFace = convertFaceLandmarkerResult(
      { faceLandmarks: [faceWith().slice(0, 100)] },
      11,
      200,
      100,
    );
    expect(shortFace.status).toBe('invalid_landmarks');
    expect(shortFace.geometry.left.invalidityReasons).toEqual([
      'landmark_missing',
    ]);
  });

  it('rifiuta più volti invece di sceglierne uno', () => {
    const result = convertFaceLandmarkerResult(
      { faceLandmarks: [faceWith(), faceWith()] },
      20,
      200,
      100,
    );

    expect(result.status).toBe('ambiguous');
    expect(result.faceCount).toBe(2);
    expect(result.geometry.left.invalidityReasons).toEqual(['ambiguous_face']);
    expect(result.geometry.right.invalidityReasons).toEqual(['ambiguous_face']);
  });

  it('gestisce landmark fuori immagine e validità parziale', () => {
    const invalidLeft: Record<number, NormalizedLandmarkLike> = {};
    for (const [index, point] of Object.entries(LEFT_OPEN)) {
      invalidLeft[Number(index)] = { x: point.x, y: 1.2 };
    }
    const invalid = convertFaceLandmarkerResult(
      { faceLandmarks: [faceWith(RIGHT_OPEN, invalidLeft)] },
      30,
      200,
      100,
    );

    expect(invalid.status).toBe('face');
    expect(invalid.geometry.right.valid).toBe(true);
    expect(invalid.geometry.left.valid).toBe(false);
    expect(invalid.geometry.left.invalidityReasons).toContain('out_of_range');
    expect(invalid.message).toContain('un occhio');
  });
});

function runtimeWith(
  result: FaceLandmarkerResultLike = { faceLandmarks: [faceWith()] },
): {
  readonly runtime: FaceLandmarkerRuntime;
  readonly state: {
    detectCalls: number;
    lastTimestamp: number | null;
    closed: boolean;
    fail: Error | null;
  };
} {
  const state = {
    detectCalls: 0,
    lastTimestamp: null as number | null,
    closed: false,
    fail: null as Error | null,
  };

  return {
    state,
    runtime: {
      detectForVideo(_source, timestampMs) {
        state.detectCalls += 1;
        state.lastTimestamp = timestampMs;

        if (state.fail !== null) {
          throw state.fail;
        }

        return result;
      },
      close() {
        state.closed = true;
      },
    },
  };
}

const CONFIG = {
  modelAssetPath: 'models/face_landmarker.task',
  wasmAssetPath: 'models/wasm',
};

describe('adattatore MediaPipe N04', () => {
  it('valida la configurazione e normalizza la directory WASM', () => {
    const config = resolveMediaPipeAdapterConfig({
      ...CONFIG,
      numFaces: 2,
      geometry: { minEyeWidthPx: 4 },
    });

    expect(config.wasmAssetPath).toBe('models/wasm/');
    expect(config.numFaces).toBe(2);
    expect(config.geometry.minEyeWidthPx).toBe(4);
    expect(config.configId).toContain('delegate=CPU');

    expect(() =>
      resolveMediaPipeAdapterConfig({
        ...CONFIG,
        modelAssetPath: 'https://example.com/model.task',
      }),
    ).toThrow(InferenceError);
    expect(() =>
      resolveMediaPipeAdapterConfig({ ...CONFIG, numFaces: 0 }),
    ).toThrow(InferenceError);
  });

  it('carica il runtime una volta e converte un frame', async () => {
    const fake = runtimeWith();
    const factory = vi.fn(async () => fake.runtime);
    const adapter = new MediaPipeFaceLandmarkerAdapter(CONFIG, {
      runtimeFactory: factory,
    });

    await adapter.init();
    await adapter.init();

    expect(factory).toHaveBeenCalledTimes(1);
    expect(adapter.getStatus().status).toBe('ready');

    const result = adapter.processFrame(frame(1000));
    expect(result.status).toBe('face');
    if (result.status === 'cancelled') {
      throw new Error('Il frame non doveva essere annullato.');
    }
    expect(result.geometry.left.valid).toBe(true);
    expect(fake.state.detectCalls).toBe(1);
    expect(fake.state.lastTimestamp).toBe(1000);
    expect(adapter.getStatus().frameCount).toBe(1);
    expect(adapter.getStatus().lastFaceCount).toBe(1);
  });

  it('scarta un frame già annullato senza chiamare il runtime', async () => {
    const fake = runtimeWith();
    const adapter = new MediaPipeFaceLandmarkerAdapter(CONFIG, {
      runtimeFactory: async () => fake.runtime,
    });
    await adapter.init();

    const result = adapter.processFrame(frame(1000), { aborted: true });
    expect(result.status).toBe('cancelled');
    expect(fake.state.detectCalls).toBe(0);
  });

  it('rifiuta frame non monotoni e frame malformati', async () => {
    const fake = runtimeWith();
    const adapter = new MediaPipeFaceLandmarkerAdapter(CONFIG, {
      runtimeFactory: async () => fake.runtime,
    });
    await adapter.init();
    adapter.processFrame(frame(1000));

    expect(() => adapter.processFrame(frame(1000))).toThrow(InferenceError);
    expect(() => adapter.processFrame(frame(999))).toThrow(InferenceError);
    expect(adapter.processFrame(frame(1001)).status).toBe('face');

    const malformed = frame(1002, { width: 0 });
    expect(() => adapter.processFrame(malformed)).toThrow(InferenceError);
  });

  it('richiede init e segnala gli errori di caricamento e inferenza', async () => {
    const notReady = new MediaPipeFaceLandmarkerAdapter(CONFIG, {
      runtimeFactory: async () => runtimeWith().runtime,
    });
    expect(() => notReady.processFrame(frame(1000))).toThrow(InferenceError);

    const loadFailure = new MediaPipeFaceLandmarkerAdapter(CONFIG, {
      runtimeFactory: async () => {
        throw new Error('modello mancante');
      },
    });
    await expect(loadFailure.init()).rejects.toMatchObject({
      code: 'runtime_load_failed',
    });
    expect(loadFailure.getStatus().status).toBe('error');

    const fake = runtimeWith();
    const runtimeFailure = new MediaPipeFaceLandmarkerAdapter(CONFIG, {
      runtimeFactory: async () => fake.runtime,
    });
    await runtimeFailure.init();
    fake.state.fail = new Error('errore runtime');

    let caught: unknown;
    try {
      runtimeFailure.processFrame(frame(1000));
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: 'runtime_error' });
  });

  it('rilascia il runtime e permette un nuovo init', async () => {
    const first = runtimeWith();
    const second = runtimeWith();
    const factory = vi
      .fn()
      .mockResolvedValueOnce(first.runtime)
      .mockResolvedValueOnce(second.runtime);
    const adapter = new MediaPipeFaceLandmarkerAdapter(CONFIG, {
      runtimeFactory: factory,
    });

    await adapter.init();
    adapter.release();
    expect(first.state.closed).toBe(true);
    expect(adapter.getStatus().status).toBe('released');
    expect(() => adapter.processFrame(frame(1000))).toThrow(InferenceError);

    await adapter.init();
    expect(factory).toHaveBeenCalledTimes(2);
    expect(adapter.getStatus().status).toBe('ready');
  });

  it('espone versione, modello, licenza e identificativo', async () => {
    const fake = runtimeWith();
    const adapter = new MediaPipeFaceLandmarkerAdapter(CONFIG, {
      runtimeFactory: async () => fake.runtime,
    });
    await adapter.init();

    const provenance = adapter.getProvenance();
    expect(provenance.runtimeVersion).toBe(MEDIAPIPE_RUNTIME_VERSION);
    expect(provenance.modelSha256).toBe(FACE_LANDMARKER_MODEL.sha256);
    expect(provenance.modelSizeBytes).toBe(FACE_LANDMARKER_MODEL.sizeBytes);
    expect(provenance.modelLicense).toBe('Apache-2.0');
    expect(provenance.geometryMethodVersion).toBe('n03-ear-v1');
    expect(provenance.numFaces).toBe(2);
  });
});
