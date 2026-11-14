import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InferenceFrame, InferenceFrameConsumer } from '../contracts/frame';
import type { CapturedVideoFrame } from './video-frame-pump';
import { createInferenceFrameAdapter } from './inference-frame-adapter';

let canvas: { width: number; height: number; getContext: ReturnType<typeof vi.fn> };
let drawImage: ReturnType<typeof vi.fn>;
let getImageData: ReturnType<typeof vi.fn>;
let createElement: ReturnType<typeof vi.fn>;

function captured(signal = new AbortController().signal): CapturedVideoFrame {
  return {
    source: {} as HTMLVideoElement, width: 2, height: 1,
    timestampMs: 123, mediaTimeSeconds: 0, signal,
  };
}

beforeEach(() => {
  drawImage = vi.fn();
  getImageData = vi.fn(() => ({ data: new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255]) }));
  canvas = { width: 0, height: 0, getContext: vi.fn(() => ({ drawImage, getImageData })) };
  createElement = vi.fn(() => canvas);
  vi.stubGlobal('document', { createElement });
});

afterEach(() => { vi.unstubAllGlobals(); });

describe('confine webcam → contratto InferenceFrame C01', () => {
  it('copia subito i pixel RGBA e consegna dimensioni, origine, timestamp e segnale', async () => {
    let received: InferenceFrame | undefined;
    const source = captured();
    const consume: InferenceFrameConsumer = (frame, signal) => {
      received = frame;
      expect(signal).toBe(source.signal);
      expect(frame).toMatchObject({ frameId: 1, timestampMs: 123, width: 2, height: 1, source: 'webcam' });
      expect(frame.pixels.format).toBe('rgba8');
      expect([...frame.pixels.data]).toEqual([10, 20, 30, 255, 40, 50, 60, 255]);
      frame.release();
    };
    const adapter = createInferenceFrameAdapter(consume);
    const result = adapter(source);
    expect(drawImage).toHaveBeenCalledWith(source.source, 0, 0, 2, 1);
    expect(getImageData).toHaveBeenCalledWith(0, 0, 2, 1);
    expect(received).toBeDefined();
    await result;
    expect(() => received?.pixels).toThrow('rilasciato');
  });

  it('mantiene i pixel validi fino alla fine del consumer asincrono e non sovrascrive il buffer', async () => {
    let finish!: () => void;
    let received!: InferenceFrame;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const adapter = createInferenceFrameAdapter(async (frame) => {
      received = frame;
      await pending;
      frame.release();
    });
    const result = adapter(captured());
    const data = received.pixels.data;
    expect(data.byteLength).toBe(8);
    expect(getImageData).toHaveBeenCalledOnce();
    finish();
    await result;
    expect(() => received.pixels).toThrow('rilasciato');
  });

  it('ripulisce il buffer se il consumer lancia un errore o dimentica il rilascio', async () => {
    let failed!: InferenceFrame;
    const throwing = createInferenceFrameAdapter((frame) => {
      failed = frame;
      throw new Error('inferenza fallita');
    });
    await expect(throwing(captured())).rejects.toThrow('inferenza fallita');
    expect(() => failed.pixels).toThrow('rilasciato');
    let forgotten!: InferenceFrame;
    await createInferenceFrameAdapter((frame) => { forgotten = frame; })(captured());
    expect(() => forgotten.pixels).toThrow('rilasciato');
    expect(() => forgotten.release()).not.toThrow();
  });

  it('propaga annullamento senza liberare pixel ancora in uso', async () => {
    const abort = new AbortController();
    let finish!: () => void;
    let received!: InferenceFrame;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const adapter = createInferenceFrameAdapter(async (frame, signal) => {
      received = frame;
      await pending;
      expect(signal.aborted).toBe(true);
      frame.release();
    });
    const result = adapter(captured(abort.signal));
    abort.abort();
    expect(received.pixels.data.byteLength).toBe(8);
    finish();
    await result;
    expect(() => received.pixels).toThrow('rilasciato');
  });

  it('non crea canvas per una sessione già annullata', async () => {
    const abort = new AbortController();
    abort.abort();
    const consume = vi.fn();
    await createInferenceFrameAdapter(consume)(captured(abort.signal));
    expect(createElement).not.toHaveBeenCalled();
    expect(consume).not.toHaveBeenCalled();
  });

  it('trasferisce il buffer a un Worker senza inviare sorgenti DOM o funzioni', async () => {
    await createInferenceFrameAdapter((frame) => {
      const data = frame.pixels.data;
      const transferred = structuredClone({
        frameId: frame.frameId, timestampMs: frame.timestampMs, width: frame.width,
        height: frame.height, source: frame.source, pixels: frame.pixels,
      }, { transfer: [data.buffer] });
      expect(data.byteLength).toBe(0);
      expect([...transferred.pixels.data]).toEqual([10, 20, 30, 255, 40, 50, 60, 255]);
      frame.release();
    })(captured());
  });

  it('assegna frameId crescenti e non riusa i pixel del frame precedente', async () => {
    const ids: number[] = [];
    const arrays: Uint8ClampedArray[] = [];
    const adapter = createInferenceFrameAdapter((frame) => {
      ids.push(frame.frameId);
      arrays.push(frame.pixels.data);
      frame.release();
    });
    await adapter(captured());
    await adapter({ ...captured(), timestampMs: 200, width: 1, height: 2 });
    expect(ids).toEqual([1, 2]);
    expect(arrays[0]).not.toBe(arrays[1]);
    expect(canvas.width).toBe(1);
    expect(canvas.height).toBe(2);
    expect(createElement).toHaveBeenCalledOnce();
  });

  it('non invoca il consumer se manca il canvas o la lettura restituisce dati errati', async () => {
    const consume = vi.fn();
    canvas.getContext.mockReturnValueOnce(null);
    await expect(createInferenceFrameAdapter(consume)(captured())).rejects.toThrow('canvas');
    getImageData.mockReturnValueOnce({ data: new Uint8ClampedArray(3) });
    await expect(createInferenceFrameAdapter(consume)(captured())).rejects.toThrow('Dimensione');
    expect(consume).not.toHaveBeenCalled();
  });
});
