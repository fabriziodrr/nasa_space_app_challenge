/** Origine dichiarata dei fotogrammi, conservata anche nei risultati esportati. */
export type FrameSourceKind = 'webcam' | 'synthetic';

/**
 * Buffer RGBA a 8 bit per canale.
 *
 * Il contratto non dipende dal DOM: un Web Worker può ricevere `data.buffer`
 * come transferable senza che il motore temporale debba conoscere il frame.
 */
export interface RgbaFrameBuffer {
  readonly format: 'rgba8';
  readonly data: Uint8ClampedArray<ArrayBuffer>;
}

/**
 * Fotogramma in ingresso all'inferenza.
 *
 * `timestampMs` deve essere monotono e in millisecondi. Il produttore mantiene
 * valido il buffer finché il consumatore non chiama `release`; il consumatore
 * chiama `release` esattamente una volta, anche in caso di errore. Dopo il
 * rilascio non può usare i pixel; release è idempotente per sicurezza.
 */
export interface InferenceFrame {
  readonly frameId: number;
  readonly timestampMs: number;
  readonly width: number;
  readonly height: number;
  readonly pixels: RgbaFrameBuffer;
  readonly source: FrameSourceKind;
  readonly release: () => void;
}

/** Le risposte di una sessione annullata non devono raggiungere il motore. */
export type InferenceFrameConsumer = (
  frame: InferenceFrame,
  signal: AbortSignal,
) => void | Promise<void>;
