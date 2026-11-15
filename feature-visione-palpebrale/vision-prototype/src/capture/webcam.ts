import { VideoFramePump } from './video-frame-pump';
import { createInferenceFrameAdapter } from './inference-frame-adapter';
import type { InferenceFrameConsumer } from '../contracts/frame';
import type { SessionInterruptionReason } from '../contracts/session';
import type { CameraDevice } from '../integration/session-export';

export type WebcamStatus = 'idle' | 'requesting' | 'starting' | 'active' | 'suspended' | 'error';

export interface WebcamSnapshot {
  readonly status: WebcamStatus;
  readonly message: string;
  readonly width: number;
  readonly height: number;
  readonly frameCount: number;
  readonly interruption?: SessionInterruptionReason;
  readonly device: CameraDevice | null;
}

export const initialWebcamSnapshot: WebcamSnapshot = {
  status: 'idle', message: 'The camera is off.', width: 0, height: 0, frameCount: 0, device: null,
};

function cameraError(error: unknown): string {
  const name = error && typeof error === 'object' && 'name' in error ? error.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera access denied. Allow the camera in browser permissions and retry.';
    case 'NotFoundError':
      return 'No camera available. Connect a webcam and retry.';
    case 'NotReadableError':
    case 'AbortError':
      return 'Unable to read the webcam. Check its connection and whether another app is using it.';
    case 'OverconstrainedError':
      return 'Selected camera unavailable. Choose another source and retry.';
    case 'TimeoutError':
      return 'The webcam preview timed out. Stop and retry.';
    default:
      return 'Unable to start preview. Check your webcam and retry.';
  }
}

/** Attesa annullabile: stop non dipende dalla risoluzione della Promise play(). */
function playVideo(video: HTMLVideoElement, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cancel = () => finish(new DOMException('Avvio annullato', 'AbortError'));
    const timer = setTimeout(() => finish(new DOMException('Preview not ready', 'TimeoutError')), 15000);
    const finish = (error?: unknown) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      if (error) reject(error);
      else resolve();
    };
    if (signal.aborted) { cancel(); return; }
    signal.addEventListener('abort', cancel, { once: true });
    try { video.play().then(() => finish(), finish); }
    catch (error) { finish(error); }
  });
}

export class WebcamCapture {
  private snapshot: WebcamSnapshot = initialWebcamSnapshot;
  private stream: MediaStream | undefined;
  private generation = 0;
  private disposed = false;
  private abort = new AbortController();
  private readonly pump: VideoFramePump;
  private removeTrackListeners: (() => void)[] = [];
  private lastUpdateMs = -Infinity;

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly onChange: (snapshot: WebcamSnapshot) => void,
    consume?: InferenceFrameConsumer,
    shouldConsume: () => boolean = () => true,
  ) {
    const forward = consume ? createInferenceFrameAdapter(consume) : undefined;
    this.pump = new VideoFramePump(video, async (frame) => {
      const generation = this.generation;
      if (shouldConsume()) await forward?.(frame);
      if (frame.signal.aborted || generation !== this.generation) return;
      this.snapshot = {
        ...this.snapshot, width: frame.width, height: frame.height,
        frameCount: this.snapshot.frameCount + 1,
      };
      if (frame.timestampMs - this.lastUpdateMs >= 250) {
        this.lastUpdateMs = frame.timestampMs;
        this.publish(this.snapshot);
      }
    }, () => this.fail('Images could not be processed. The camera was stopped.'));
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    document.addEventListener('freeze', this.onPageHide);
    window.addEventListener('pagehide', this.onPageHide);
    video.addEventListener('error', this.onVideoError);
  }

  async start(deviceId = ''): Promise<void> {
    if (this.disposed || this.snapshot.status === 'requesting'
      || this.snapshot.status === 'starting' || this.snapshot.status === 'active') return;
    this.release();
    const generation = this.generation;
    this.abort = new AbortController();
    this.lastUpdateMs = -Infinity;
    this.publish({ ...initialWebcamSnapshot, status: 'requesting', message: 'Waiting for camera permission…' });

    if (!window.isSecureContext) {
      this.fail('Apri l’app su localhost, 127.0.0.1 oppure HTTPS per usare la webcam.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      this.fail('This browser does not provide webcam access. Use an updated browser.');
      return;
    }
    if (document.visibilityState === 'hidden') { this.onPageHide(); return; }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 },
          ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' }),
        },
      });
      if (this.disposed || generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      const tracks = stream.getVideoTracks();
      if (!tracks.length || tracks.some((track) => track.readyState === 'ended')) {
        this.fail('The webcam is not providing a video signal.');
        return;
      }
      for (const track of tracks) {
        track.addEventListener('ended', this.onTrackEnded);
        track.addEventListener('mute', this.onTrackMuted);
        this.removeTrackListeners.push(() => {
          track.removeEventListener('ended', this.onTrackEnded);
          track.removeEventListener('mute', this.onTrackMuted);
        });
      }
      this.video.muted = true;
      this.video.playsInline = true;
      this.video.srcObject = stream;
      const track = tracks[0];
      let actualDeviceId: string | null = null;
      try { actualDeviceId = track?.getSettings?.().deviceId || null; } catch { /* Alcuni browser non espongono le impostazioni. */ }
      this.publish({ ...this.snapshot, status: 'starting', message: 'Starting preview…', device: { id: actualDeviceId, label: track?.label || null } });
      await playVideo(this.video, this.abort.signal);
      if (this.disposed || generation !== this.generation) return;
      this.publish({ ...this.snapshot, status: 'active', message: 'Preview active. Eyelid measurements are not available yet.' });
      this.pump.start();
    } catch (error) {
      if (!this.disposed && generation === this.generation) this.fail(cameraError(error));
    }
  }

  stop(message = 'The camera has stopped.', interruption: SessionInterruptionReason = 'user_stop'): void {
    this.release();
    this.publish({ ...initialWebcamSnapshot, message, interruption });
  }

  dispose(): void {
    this.disposed = true;
    this.release();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    document.removeEventListener('freeze', this.onPageHide);
    window.removeEventListener('pagehide', this.onPageHide);
    this.video.removeEventListener('error', this.onVideoError);
  }

  private publish(snapshot: WebcamSnapshot): void {
    this.snapshot = snapshot;
    if (!this.disposed) this.onChange(snapshot);
  }

  private release(): void {
    this.generation++;
    this.abort.abort();
    this.pump.stop();
    this.removeTrackListeners.forEach((remove) => remove());
    this.removeTrackListeners = [];
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
    this.video.pause();
    this.video.srcObject = null;
  }

  private fail(message: string, interruption: SessionInterruptionReason = 'processing_error'): void {
    this.release();
    this.publish({ ...initialWebcamSnapshot, status: 'error', message, interruption });
  }

  private isRunning(): boolean {
    return ['requesting', 'starting', 'active'].includes(this.snapshot.status);
  }

  private onTrackEnded = (): void => {
    this.fail('Camera connection lost. Check the device and restart.', 'device_lost');
  };

  private onTrackMuted = (): void => {
    if (this.snapshot.status === 'active') {
      this.fail('Camera signal unavailable. Check the device and restart.', 'device_lost');
    }
  };

  private onVideoError = (): void => {
    if (this.isRunning()) this.fail('Video playback error. The camera was stopped.');
  };

  private onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') this.onPageHide();
  };

  private onPageHide = (): void => {
    if (!this.isRunning()) return;
    this.release();
    this.publish({
      ...initialWebcamSnapshot, status: 'suspended',
      interruption: 'page_hidden',
      message: 'Capture stopped because the tab was hidden or suspended. Press Start to resume.',
    });
  };
}
