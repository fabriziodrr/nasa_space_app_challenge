import type { InferenceFrame, InferenceFrameConsumer, RgbaFrameBuffer } from '../contracts/frame';
import type { FrameConsumer } from './video-frame-pump';

/** Copia sincrona prima dell'await; nessun frame in prestito oltre questo confine. */
export function createInferenceFrameAdapter(consume: InferenceFrameConsumer): FrameConsumer {
  let canvas: HTMLCanvasElement | undefined;
  let context: CanvasRenderingContext2D | null = null;
  let frameId = 0;

  return async (captured) => {
    if (captured.signal.aborted) return;
    if (!canvas) {
      canvas = document.createElement('canvas');
      context = canvas.getContext('2d', { willReadFrequently: true });
    }
    if (!context) throw new Error('Acquisizione RGBA non disponibile: contesto canvas 2D assente.');
    if (canvas.width !== captured.width) canvas.width = captured.width;
    if (canvas.height !== captured.height) canvas.height = captured.height;
    context.drawImage(captured.source, 0, 0, captured.width, captured.height);
    const image = context.getImageData(0, 0, captured.width, captured.height);
    if (image.data.length !== captured.width * captured.height * 4) {
      throw new Error('Dimensione del buffer RGBA non coerente con il fotogramma.');
    }

    let pixels: RgbaFrameBuffer | undefined = Object.freeze({ format: 'rgba8', data: image.data });
    const frame: InferenceFrame = Object.freeze({
      frameId: ++frameId,
      timestampMs: captured.timestampMs,
      width: captured.width,
      height: captured.height,
      source: 'webcam' as const,
      get pixels(): RgbaFrameBuffer {
        if (!pixels) throw new Error('Il fotogramma è già stato rilasciato.');
        return pixels;
      },
      release: () => { pixels = undefined; },
    });

    try {
      await consume(frame, captured.signal);
    } finally {
      // Protezione anche per consumer fallibili o che dimenticano release().
      if (pixels) frame.release();
    }
  };
}
