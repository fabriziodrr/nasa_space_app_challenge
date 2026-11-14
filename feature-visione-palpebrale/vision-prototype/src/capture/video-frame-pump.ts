/** Dettaglio interno di acquisizione; l'inferenza riceve InferenceFrame RGBA. */
export interface CapturedVideoFrame {
  /** Sorgente in prestito: acquisire un eventuale bitmap prima del primo await. */
  readonly source: HTMLVideoElement;
  readonly width: number;
  readonly height: number;
  /** performance.now(), millisecondi monotoni; non è l'ora del sensore. */
  readonly timestampMs: number;
  readonly mediaTimeSeconds: number;
  readonly signal: AbortSignal;
}

export type FrameConsumer = (frame: CapturedVideoFrame) => void | Promise<void>;

/** Non crea code o buffer: al massimo un consumatore asincrono alla volta. */
export class VideoFramePump {
  private generation = 0;
  private running = false;
  private busy = false;
  private handle: number | undefined;
  private nativeCallback = false;
  private abort = new AbortController();
  private lastMediaTime = -1;
  private lastFrameNumber = -1;
  private lastTimestamp = -Infinity;

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly consume: FrameConsumer,
    private readonly onError: (error: unknown) => void,
  ) {}

  start(): void {
    this.stop();
    this.running = true;
    this.abort = new AbortController();
    this.lastMediaTime = -1;
    this.lastFrameNumber = -1;
    this.nativeCallback = typeof this.video.requestVideoFrameCallback === 'function'
      && typeof this.video.cancelVideoFrameCallback === 'function';
    this.schedule(this.generation);
  }

  stop(): void {
    this.running = false;
    this.generation++;
    this.abort.abort();
    if (this.handle !== undefined) {
      if (this.nativeCallback) this.video.cancelVideoFrameCallback(this.handle);
      else cancelAnimationFrame(this.handle);
      this.handle = undefined;
    }
    // Non azzerare busy: anche dopo un riavvio il vecchio consumer deve terminare.
  }

  private schedule(generation: number): void {
    if (!this.running || generation !== this.generation) return;
    if (this.nativeCallback) {
      this.handle = this.video.requestVideoFrameCallback((now, metadata) => {
        if (generation !== this.generation) return;
        this.handle = undefined;
        void this.deliver(generation, now, metadata.mediaTime);
      });
    } else {
      this.handle = requestAnimationFrame((now) => {
        if (generation !== this.generation) return;
        this.handle = undefined;
        const totalFrames = this.video.getVideoPlaybackQuality?.().totalVideoFrames;
        void this.deliver(generation, now, this.video.currentTime, totalFrames);
      });
    }
  }

  private async deliver(generation: number, timestampMs: number, mediaTimeSeconds: number, frameNumber?: number): Promise<void> {
    if (!this.running || generation !== this.generation) return;
    if (this.busy || this.video.readyState < 2 || this.video.videoWidth === 0
      || this.video.videoHeight === 0 || !Number.isFinite(timestampMs)
      || !Number.isFinite(mediaTimeSeconds) || mediaTimeSeconds <= this.lastMediaTime
      || (frameNumber !== undefined && frameNumber > 0 && frameNumber <= this.lastFrameNumber)
      || timestampMs <= this.lastTimestamp) {
      this.schedule(generation);
      return;
    }

    this.busy = true;
    this.lastMediaTime = mediaTimeSeconds;
    this.lastTimestamp = timestampMs;
    if (frameNumber !== undefined && frameNumber > 0) this.lastFrameNumber = frameNumber;
    try {
      await this.consume({
        source: this.video,
        width: this.video.videoWidth,
        height: this.video.videoHeight,
        timestampMs,
        mediaTimeSeconds,
        signal: this.abort.signal,
      });
    } catch (error) {
      if (this.running && generation === this.generation) {
        this.stop();
        this.onError(error);
      }
    } finally {
      this.busy = false;
      this.schedule(generation);
    }
  }
}
