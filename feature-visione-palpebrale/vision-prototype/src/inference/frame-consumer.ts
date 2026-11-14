import type { InferenceFrameConsumer } from '../contracts/frame';
import type { FaceInferenceResult } from '../contracts/inference';
import type { MediaPipeFaceLandmarkerAdapter } from './mediapipe-adapter';

export type InferenceResultConsumer = (result: FaceInferenceResult) => void;

/**
 * Adatta l'adattatore al consumer RGBA di C01.
 *
 * L'elaborazione è sincrona e non accoda frame: il pump attende questa funzione
 * prima di consegnare il successivo. Il buffer viene rilasciato sempre, anche se
 * l'adattatore o il consumer falliscono. I risultati annullati o appartenenti a
 * una sessione già ferma vengono scartati. Il rilascio del runtime resta a carico
 * del proprietario della sessione (T04), che chiama `release()` allo stop.
 */
export function createMediaPipeFrameConsumer(
  adapter: MediaPipeFaceLandmarkerAdapter,
  onResult: InferenceResultConsumer,
): InferenceFrameConsumer {
  return (frame, signal) => {
    try {
      const result = adapter.processFrame(frame, signal);

      if (result.status !== 'cancelled' && !signal.aborted) {
        onResult(result);
      }
    } finally {
      frame.release();
    }
  };
}
