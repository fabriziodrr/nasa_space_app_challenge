import { describe, expect, it, vi } from 'vitest';
import { LiveSession } from './live-session';
import type { LiveSnapshot } from './live-session';
import { MediaPipeFaceLandmarkerAdapter } from '../inference/mediapipe-adapter';
import type { FaceInferenceResult, InferenceFrame } from '../contracts';
import { TemporalEngine } from '../analysis/engine';
import { initialWebcamSnapshot } from '../capture/webcam';
import { createSessionValidationReport } from '../validation/session-report';

function observation(timestampMs: number, ear: number | null): FaceInferenceResult {
  const eye = (side: 'left' | 'right') => ear === null
    ? { side, valid: false as const, horizontalWidthPx: 0, invalidityReasons: ['not_tracked'] as const }
    : { side, valid: true as const, horizontalWidthPx: 100, eyeAspectRatio: ear, invalidityReasons: [] as const };
  return { status: ear === null ? 'no_face' : 'face', timestampMs, faceCount: ear === null ? 0 : 1, message: 'test',
    geometry: { timestampMs, methodVersion: 'n03-ear-v1', imageWidth: 640, imageHeight: 480, left: eye('left'), right: eye('right') } };
}

describe('sessione webcam T04', () => {
  it('collega calibrazione, misura, perdita del volto e arresto al motore', async () => {
    let result = observation(0, 0.3);
    const metadata = new MediaPipeFaceLandmarkerAdapter({ modelAssetPath: '/model.task', wasmAssetPath: '/wasm/' });
    const adapter = { init: vi.fn().mockResolvedValue(undefined), release: vi.fn(), processFrame: vi.fn(() => result),
      getConfig: () => metadata.getConfig(), getProvenance: () => metadata.getProvenance() };
    let state: LiveSnapshot | undefined;
    const session = new LiveSession(adapter as unknown as MediaPipeFaceLandmarkerAdapter, (value) => { state = value; });
    const send = async (time: number, ear: number | null) => {
      result = observation(time, ear);
      const release = vi.fn();
      await session.consume({ release } as unknown as InferenceFrame, new AbortController().signal);
      expect(release).toHaveBeenCalledOnce();
    };
    await session.start();
    session.startOpen();
    for (let i = 0; i < 8; i++) await send(i * 20, 0.3);
    session.startClosed();
    for (let i = 0; i < 8; i++) await send(200 + i * 20, 0.1);
    session.finishCalibration();
    expect(state?.phase).toBe('preview');
    expect(state?.calibration.status).toBe('ready');
    session.startMeasurement();
    await send(400, 0.3);
    const displayed = state;
    await send(500, 0.1);
    if (!displayed) throw new Error('Stato visualizzato atteso');
    const earlierExport = session.exportSnapshot(displayed);
    expect(earlierExport.snapshot).toEqual(displayed.engine);
    expect(earlierExport.samples).toHaveLength(1);
    await send(600, null);
    await send(700, 0.3);
    session.stopMeasurement();
    expect(state?.engine?.session.validMs).toBe(200);
    expect(state?.engine?.session.events.find((event) => event.kind === 'bilateral')).toMatchObject({ complete: false, endedReason: 'tracking_lost' });
    expect(state?.history[2]?.left).toBeNull();
    session.stop();
    expect(state?.phase).toBe('stopped');
    expect(adapter.release).toHaveBeenCalled();
    if (!state) throw new Error('Stato atteso');
    const exported = session.exportSnapshot(state);
    expect(exported.snapshot).toEqual(state.engine);
    expect(exported.samples).toHaveLength(4);
    expect(exported.calibration.kind).toBe('profiles');
    const report = createSessionValidationReport(exported);
    expect(report.comparison).toBeNull();
    expect(report.performance?.count).toBe(4);
    expect(report.calibration).toEqual(exported.calibration);
    const replay = new TemporalEngine(exported.snapshot.config);
    replay.start();
    exported.samples.forEach((sample) => replay.processSample(sample));
    replay.stop();
    expect(replay.getSnapshot()).toEqual(exported.snapshot);
  });

  it('ignora un caricamento completato dopo lo stop', async () => {
    let finish!: () => void;
    const adapter = { init: () => new Promise<void>((resolve) => { finish = resolve; }), release: vi.fn() };
    let state: LiveSnapshot | undefined;
    const session = new LiveSession(adapter as unknown as MediaPipeFaceLandmarkerAdapter, (value) => { state = value; });
    const start = session.start();
    session.stop();
    finish();
    await start;
    expect(state?.phase).toBe('stopped');
  });

  it('distingue sospensione, cambio sorgente ed errore e conserva la causa della calibrazione interrotta', async () => {
    const adapter = { init: vi.fn().mockResolvedValue(undefined), release: vi.fn() };
    let state: LiveSnapshot | undefined;
    const session = new LiveSession(adapter as unknown as MediaPipeFaceLandmarkerAdapter, (value) => { state = value; });
    await session.start(); session.startOpen();
    session.handleCaptureState({ ...initialWebcamSnapshot, status: 'suspended', message: 'Nascosta', interruption: 'page_hidden' });
    expect(state).toMatchObject({ phase: 'suspended', source: 'webcam', interruption: 'page_hidden', error: null,
      calibration: { status: 'insufficient', reasons: ['interrupted'] } });
    await session.start();
    session.handleCaptureState({ ...initialWebcamSnapshot, status: 'idle', message: 'Nuova sorgente', interruption: 'source_changed' });
    expect(state).toMatchObject({ phase: 'stopped', interruption: 'source_changed', error: null });
    await session.start();
    session.handleCaptureState({ ...initialWebcamSnapshot, status: 'error', message: 'Fotocamera scollegata', interruption: 'device_lost' });
    expect(state).toMatchObject({ phase: 'error', interruption: 'device_lost', error: { stage: 'capture', message: 'Fotocamera scollegata' } });
  });

  it('conserva la fase di inferenza quando il consumer fallisce e rilascia il frame', async () => {
    const adapter = { init: vi.fn().mockResolvedValue(undefined), release: vi.fn(), processFrame: () => { throw new Error('inferenza fallita'); } };
    let state: LiveSnapshot | undefined;
    const session = new LiveSession(adapter as unknown as MediaPipeFaceLandmarkerAdapter, (value) => { state = value; });
    await session.start();
    const release = vi.fn();
    expect(() => session.consume({ release } as unknown as InferenceFrame, new AbortController().signal)).toThrow('inferenza fallita');
    expect(release).toHaveBeenCalledOnce();
    session.handleCaptureState({ ...initialWebcamSnapshot, status: 'error', message: 'Errore webcam generico', interruption: 'processing_error' });
    expect(state).toMatchObject({ phase: 'error', error: { stage: 'inference', message: 'inferenza fallita' } });
    session.handleCaptureState({ ...initialWebcamSnapshot, status: 'error', message: 'Dispositivo rimosso', interruption: 'device_lost' });
    expect(state).toMatchObject({ phase: 'error', interruption: 'device_lost', error: { stage: 'capture', message: 'Dispositivo rimosso' } });
  });

  it('ferma la misura al limite esplicito, limita il grafico e conserva tutti i campioni', async () => {
    let result = observation(0, 0.3);
    const metadata = new MediaPipeFaceLandmarkerAdapter({ modelAssetPath: '/model.task', wasmAssetPath: '/wasm/' });
    const adapter = { init: vi.fn().mockResolvedValue(undefined), release: vi.fn(), processFrame: vi.fn(() => result),
      getConfig: () => metadata.getConfig(), getProvenance: () => metadata.getProvenance() };
    let state: LiveSnapshot | undefined;
    let clock = 0;
    const session = new LiveSession(adapter as unknown as MediaPipeFaceLandmarkerAdapter, (value) => { state = value; },
      { maxSamples: 4, maxChartPoints: 2, calibration: { requiredSamplesPerEye: 2 }, now: () => ++clock });
    const send = (time: number, ear: number | null) => {
      result = observation(time, ear);
      session.consume({ release: vi.fn() } as unknown as InferenceFrame, new AbortController().signal);
    };
    await session.start();
    session.handleCaptureState({ ...initialWebcamSnapshot, status: 'active', device: { id: 'camera-test', label: 'Webcam test' } });
    session.startOpen(); send(0, 0.3); send(20, 0.3);
    session.startClosed(); send(40, 0.1); send(60, 0.1); session.finishCalibration(); session.startMeasurement();
    send(100, 0.3); send(200, null); send(300, 0.3); send(400, 0.3);
    expect(state).toMatchObject({ phase: 'preview', interruption: 'sample_limit', sampleCount: 4, performanceCount: 4, chartReduced: true });
    expect(state!.history.length).toBeLessThanOrEqual(2);
    const data = session.exportSnapshot(state!);
    expect(data.samples).toHaveLength(4);
    expect(data.performanceSamples).toHaveLength(4);
    expect(data.source).toMatchObject({ kind: 'webcam', device: { id: 'camera-test', label: 'Webcam test' }, imageDimensions: { width: 640, height: 480 }, limits: { maxSamples: 4, maxChartPoints: 2, chartReduced: true } });
    expect(data.calibration).toMatchObject({ configurations: { [state!.exportProfile!.id]: { requiredSamplesPerEye: 2 } } });
    expect(createSessionValidationReport(data).performance).toMatchObject({ count: 4, meanInferenceMs: 1 });
  });

  it('non ricostruisce l’istantanea completa a ogni campione', async () => {
    const spy = vi.spyOn(TemporalEngine.prototype, 'getSnapshot');
    try {
      let result = observation(0, 0.3);
      const adapter = { init: vi.fn().mockResolvedValue(undefined), release: vi.fn(), processFrame: vi.fn(() => result) };
      const session = new LiveSession(adapter as unknown as MediaPipeFaceLandmarkerAdapter, () => {}, { calibration: { requiredSamplesPerEye: 2 } });
      const send = (time: number, ear: number) => {
        result = observation(time, ear);
        session.consume({ release: vi.fn() } as unknown as InferenceFrame, new AbortController().signal);
      };
      await session.start(); session.startOpen(); send(0, 0.3); send(10, 0.3);
      session.startClosed(); send(20, 0.1); send(30, 0.1); session.finishCalibration(); session.startMeasurement();
      spy.mockClear();
      for (let i = 0; i < 100; i++) send(100 + i, 0.3);
      expect(spy).toHaveBeenCalledTimes(1);
      session.stopMeasurement();
      expect(spy).toHaveBeenCalledTimes(2);
    } finally { spy.mockRestore(); }
  });

  it('rifiuta limiti configurati oltre il massimo esportabile', () => {
    const adapter = {} as MediaPipeFaceLandmarkerAdapter;
    expect(() => new LiveSession(adapter, () => {}, { maxSamples: 18_001 })).toThrow('Limiti');
    expect(() => new LiveSession(adapter, () => {}, { maxChartPoints: 2_001 })).toThrow('Limiti');
  });
});
