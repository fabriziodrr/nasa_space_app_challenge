import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoFramePump } from './video-frame-pump';
import type { CapturedVideoFrame } from './video-frame-pump';
import { WebcamCapture } from './webcam';
import type { WebcamSnapshot } from './webcam';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function flush() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

class FakeTrack extends EventTarget {
  readyState = 'live';
  stop = vi.fn(() => { this.readyState = 'ended'; });
}

class FakeVideo extends EventTarget {
  srcObject: MediaStream | null = null;
  muted = false;
  playsInline = false;
  readyState = 2;
  videoWidth = 1280;
  videoHeight = 720;
  currentTime = 0;
  pause = vi.fn();
  play = vi.fn<() => Promise<void>>().mockResolvedValue();
  callbacks = new Map<number, VideoFrameRequestCallback>();
  nextId = 0;
  requestVideoFrameCallback = vi.fn((callback: VideoFrameRequestCallback) => {
    const id = ++this.nextId;
    this.callbacks.set(id, callback);
    return id;
  });
  cancelVideoFrameCallback = vi.fn((id: number) => { this.callbacks.delete(id); });
  frame(timestampMs: number, mediaTime: number) {
    const entry = this.callbacks.entries().next().value;
    if (!entry) throw new Error('Nessun callback video programmato');
    this.callbacks.delete(entry[0]);
    entry[1](timestampMs, { mediaTime } as VideoFrameCallbackMetadata);
  }
  asElement() { return this as unknown as HTMLVideoElement; }
}

class FakeDocument extends EventTarget { visibilityState = 'visible'; }
class FakeWindow extends EventTarget { isSecureContext = true; }

let video: FakeVideo;
let track: FakeTrack;
let stream: MediaStream;
let doc: FakeDocument;
let win: FakeWindow;
let getUserMedia: ReturnType<typeof vi.fn<MediaDevices['getUserMedia']>>;
let snapshots: WebcamSnapshot[];
let capture: WebcamCapture | undefined;
let raf: Map<number, FrameRequestCallback>;

beforeEach(() => {
  vi.useFakeTimers();
  video = new FakeVideo();
  track = new FakeTrack();
  stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
  doc = new FakeDocument();
  win = new FakeWindow();
  getUserMedia = vi.fn<MediaDevices['getUserMedia']>().mockResolvedValue(stream);
  snapshots = [];
  raf = new Map();
  let rafId = 0;
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', win);
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    const id = ++rafId;
    raf.set(id, callback);
    return id;
  }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => { raf.delete(id); }));
});

afterEach(() => {
  capture?.dispose();
  capture = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function createCapture() {
  capture = new WebcamCapture(video.asElement(), (snapshot) => snapshots.push(snapshot));
  return capture;
}

describe('ciclo della webcam', () => {
  it('consegna al consumer pubblico il contratto RGBA invece del video DOM', async () => {
    video.videoWidth = 2;
    video.videoHeight = 1;
    const data = new Uint8ClampedArray(8);
    const createElement = vi.fn(() => ({ width: 0, height: 0, getContext: () => ({
      drawImage: vi.fn(), getImageData: () => ({ data }),
    }) }));
    Object.assign(doc, { createElement });
    const consume = vi.fn((frame: import('../contracts/frame').InferenceFrame) => {
      expect(frame.source).toBe('webcam');
      expect(frame.timestampMs).toBe(100);
      expect(frame.pixels.data).toBe(data);
      frame.release();
    });
    capture = new WebcamCapture(video.asElement(), (snapshot) => snapshots.push(snapshot), consume);
    await capture.start();
    video.frame(100, 0);
    await flush();
    expect(consume).toHaveBeenCalledOnce();
    expect(snapshots.at(-1)?.frameCount).toBe(1);
    capture.stop();
  });

  it('richiede solo video dopo start, riceve fotogrammi e rilascia tutto allo stop', async () => {
    const camera = createCapture();
    expect(getUserMedia).not.toHaveBeenCalled();
    await camera.start('camera-2');
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, deviceId: { exact: 'camera-2' } },
    });
    expect(snapshots.at(-1)?.status).toBe('active');
    expect(video.srcObject).toBe(stream);
    video.frame(100, 0);
    await flush();
    expect(snapshots.at(-1)).toMatchObject({ frameCount: 1, width: 1280, height: 720 });
    camera.stop();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(video.srcObject).toBeNull();
    expect(video.callbacks.size).toBe(0);
    expect(snapshots.at(-1)?.status).toBe('idle');
    track.dispatchEvent(new Event('ended'));
    expect(snapshots.at(-1)?.status).toBe('idle');
  });

  it('scarta e ferma un permesso concesso dopo lo stop', async () => {
    const pending = deferred<MediaStream>();
    getUserMedia.mockReturnValueOnce(pending.promise);
    const camera = createCapture();
    const start = camera.start();
    expect(snapshots.at(-1)?.status).toBe('requesting');
    camera.stop();
    pending.resolve(stream);
    await start;
    expect(track.stop).toHaveBeenCalledOnce();
    expect(video.play).not.toHaveBeenCalled();
    expect(video.srcObject).toBeNull();
    expect(snapshots.at(-1)?.status).toBe('idle');
  });

  it('non sovrascrive un nuovo avvio con il fallimento di una vecchia richiesta', async () => {
    const pending = deferred<MediaStream>();
    getUserMedia.mockReturnValueOnce(pending.promise);
    const camera = createCapture();
    const oldStart = camera.start();
    camera.stop();
    await camera.start();
    pending.reject(new DOMException('negato', 'NotAllowedError'));
    await oldStart;
    expect(snapshots.at(-1)?.status).toBe('active');
    expect(video.srcObject).toBe(stream);
    expect(track.stop).not.toHaveBeenCalled();
  });

  it('annulla anche un avvio bloccato su video.play', async () => {
    video.play.mockReturnValueOnce(new Promise(() => {}));
    const camera = createCapture();
    const start = camera.start();
    await flush();
    expect(snapshots.at(-1)?.status).toBe('starting');
    camera.stop();
    await start;
    expect(track.stop).toHaveBeenCalledOnce();
    expect(video.srcObject).toBeNull();
    expect(snapshots.at(-1)?.status).toBe('idle');
  });

  it.each([
    ['NotAllowedError', 'negato'], ['NotFoundError', 'Nessuna fotocamera'],
    ['NotReadableError', 'Impossibile leggere'], ['OverconstrainedError', 'selezionata non è disponibile'],
  ])('mostra un errore recuperabile per %s e permette un nuovo tentativo', async (name, message) => {
    getUserMedia.mockRejectedValueOnce(new DOMException('errore di prova', name));
    const camera = createCapture();
    await camera.start();
    expect(snapshots.at(-1)).toMatchObject({ status: 'error', message: expect.stringContaining(message) });
    await camera.start();
    expect(snapshots.at(-1)?.status).toBe('active');
  });

  it.each(['ended', 'mute'])('ferma le tracce se il dispositivo segnala %s', async (event) => {
    const camera = createCapture();
    await camera.start();
    track.dispatchEvent(new Event(event));
    expect(track.stop).toHaveBeenCalledOnce();
    expect(video.srcObject).toBeNull();
    expect(snapshots.at(-1)?.status).toBe('error');
  });

  it.each(['visibilitychange', 'freeze', 'pagehide'])('rilascia le risorse su %s e non riparte da sola', async (event) => {
    const camera = createCapture();
    await camera.start();
    if (event === 'visibilitychange') doc.visibilityState = 'hidden';
    (event === 'pagehide' ? win : doc).dispatchEvent(new Event(event));
    expect(snapshots.at(-1)?.status).toBe('suspended');
    expect(track.stop).toHaveBeenCalledOnce();
    expect(video.srcObject).toBeNull();
    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(snapshots.at(-1)?.status).toBe('suspended');
  });

  it('rilascia un permesso tardivo dopo lo smontaggio senza aggiornare React', async () => {
    const pending = deferred<MediaStream>();
    getUserMedia.mockReturnValueOnce(pending.promise);
    const camera = createCapture();
    const start = camera.start();
    camera.dispose();
    const count = snapshots.length;
    pending.resolve(stream);
    await start;
    expect(track.stop).toHaveBeenCalledOnce();
    expect(snapshots).toHaveLength(count);
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(snapshots).toHaveLength(count);
  });

  it('rilascia la webcam quando play fallisce o non si avvia in tempo', async () => {
    video.play.mockRejectedValueOnce(new Error('riproduzione negata'));
    const camera = createCapture();
    await camera.start();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(snapshots.at(-1)?.status).toBe('error');
    track.readyState = 'live';
    video.play.mockReturnValueOnce(new Promise(() => {}));
    const start = camera.start();
    await flush();
    await vi.advanceTimersByTimeAsync(15000);
    await start;
    expect(snapshots.at(-1)).toMatchObject({ status: 'error', message: expect.stringContaining('in tempo') });
    expect(video.srcObject).toBeNull();
    expect(track.stop).toHaveBeenCalledTimes(2);
  });

  it('evita richieste duplicate mentre un avvio è in corso', async () => {
    const pending = deferred<MediaStream>();
    getUserMedia.mockReturnValueOnce(pending.promise);
    const camera = createCapture();
    const start = camera.start();
    await camera.start();
    expect(getUserMedia).toHaveBeenCalledOnce();
    pending.resolve(stream);
    await start;
    await camera.start();
    expect(getUserMedia).toHaveBeenCalledOnce();
  });

  it('avvia e arresta più sessioni senza riutilizzare tracce o contatori precedenti', async () => {
    const tracks: FakeTrack[] = [];
    getUserMedia.mockImplementation(async () => {
      const nextTrack = new FakeTrack();
      tracks.push(nextTrack);
      return { getTracks: () => [nextTrack], getVideoTracks: () => [nextTrack] } as unknown as MediaStream;
    });
    const camera = createCapture();
    for (let cycle = 0; cycle < 3; cycle++) {
      await camera.start();
      expect(snapshots.at(-1)?.frameCount).toBe(0);
      video.frame((cycle + 1) * 1000, 0);
      await flush();
      expect(snapshots.at(-1)?.frameCount).toBe(1);
      camera.stop();
      expect(video.callbacks.size).toBe(0);
    }
    expect(tracks).toHaveLength(3);
    for (const previousTrack of tracks) expect(previousTrack.stop).toHaveBeenCalledOnce();
  });

  it('segnala contesto insicuro e API assente senza chiedere permessi', async () => {
    const camera = createCapture();
    win.isSecureContext = false;
    await camera.start();
    expect(snapshots.at(-1)?.message).toContain('HTTPS');
    win.isSecureContext = true;
    vi.stubGlobal('navigator', {});
    await camera.start();
    expect(snapshots.at(-1)?.message).toContain('browser aggiornato');
    expect(getUserMedia).not.toHaveBeenCalled();
  });
});

describe('consegna dei fotogrammi', () => {
  it('attende un consumatore lento senza accodare altri fotogrammi e lo annulla allo stop', async () => {
    const pending = deferred<void>();
    const consume = vi.fn<(frame: CapturedVideoFrame) => Promise<void>>().mockReturnValue(pending.promise);
    const pump = new VideoFramePump(video.asElement(), consume, vi.fn());
    pump.start();
    video.frame(100, 0);
    expect(consume).toHaveBeenCalledOnce();
    expect(video.callbacks.size).toBe(0);
    const frame = consume.mock.calls[0]?.[0];
    expect(frame).toMatchObject({ timestampMs: 100, mediaTimeSeconds: 0, width: 1280, height: 720 });
    pump.stop();
    expect(frame?.signal.aborted).toBe(true);
    pending.resolve();
    await flush();
    expect(video.callbacks.size).toBe(0);
  });

  it('impedisce elaborazioni sovrapposte anche fra stop e riavvio', async () => {
    const pending = deferred<void>();
    const consume = vi.fn<(frame: CapturedVideoFrame) => void | Promise<void>>()
      .mockImplementationOnce(() => pending.promise);
    const pump = new VideoFramePump(video.asElement(), consume, vi.fn());
    pump.start();
    video.frame(100, 0);
    pump.stop();
    pump.start();
    video.frame(200, 0);
    expect(consume).toHaveBeenCalledOnce();
    pending.resolve();
    await flush();
    video.frame(300, 0.03);
    await flush();
    expect(consume).toHaveBeenCalledTimes(2);
    expect(video.callbacks.size).toBe(1);
    pump.stop();
  });

  it('scarta duplicati e timestamp non crescenti senza ricostruire tempi mancanti', async () => {
    const consume = vi.fn();
    const pump = new VideoFramePump(video.asElement(), consume, vi.fn());
    pump.start();
    video.frame(100, 0);
    await flush();
    video.frame(200, 0);
    video.frame(100, 0.03);
    video.frame(90, 0.03);
    video.frame(5000, 4.9);
    await flush();
    expect(consume).toHaveBeenCalledTimes(2);
    expect(consume.mock.calls[1]?.[0].timestampMs).toBe(5000);
    pump.stop();
  });

  it('usa RAF e currentTime quando requestVideoFrameCallback manca', async () => {
    Object.defineProperty(video, 'requestVideoFrameCallback', { value: undefined });
    const consume = vi.fn();
    const pump = new VideoFramePump(video.asElement(), consume, vi.fn());
    const tick = (now: number) => {
      const entry = raf.entries().next().value;
      if (!entry) throw new Error('Nessun RAF programmato');
      raf.delete(entry[0]);
      entry[1](now);
    };
    pump.start();
    tick(100);
    await flush();
    tick(110);
    expect(consume).toHaveBeenCalledOnce();
    video.currentTime = 0.033;
    tick(140);
    await flush();
    expect(consume).toHaveBeenCalledTimes(2);
    pump.stop();
    expect(raf.size).toBe(0);
  });

  it('non consegna immagini prive di dimensioni o non ancora decodificate', async () => {
    const consume = vi.fn();
    const pump = new VideoFramePump(video.asElement(), consume, vi.fn());
    pump.start();
    video.readyState = 1;
    video.frame(100, 0);
    video.readyState = 2;
    video.videoWidth = 0;
    video.frame(200, 0.03);
    expect(consume).not.toHaveBeenCalled();
    pump.stop();
  });

  it('nel fallback non ripete lo stesso frame decodificato anche se currentTime avanza', async () => {
    Object.defineProperty(video, 'requestVideoFrameCallback', { value: undefined });
    let totalVideoFrames = 1;
    Object.defineProperty(video, 'getVideoPlaybackQuality', {
      value: () => ({ totalVideoFrames }),
    });
    const consume = vi.fn();
    const pump = new VideoFramePump(video.asElement(), consume, vi.fn());
    const tick = (now: number) => {
      const entry = raf.entries().next().value;
      if (!entry) throw new Error('Nessun RAF programmato');
      raf.delete(entry[0]);
      entry[1](now);
    };
    pump.start();
    tick(100);
    await flush();
    video.currentTime = 0.01;
    tick(110);
    expect(consume).toHaveBeenCalledOnce();
    totalVideoFrames = 2;
    video.currentTime = 0.033;
    tick(140);
    await flush();
    expect(consume).toHaveBeenCalledTimes(2);
    pump.stop();
  });

  it('ignora il rifiuto tardivo di un consumer appartenente alla sessione precedente', async () => {
    const pending = deferred<void>();
    const onError = vi.fn();
    const consume = vi.fn<(frame: CapturedVideoFrame) => void | Promise<void>>()
      .mockImplementationOnce(() => pending.promise);
    const pump = new VideoFramePump(video.asElement(), consume, onError);
    pump.start();
    video.frame(100, 0);
    pump.stop();
    pump.start();
    pending.reject(new Error('vecchia inferenza annullata'));
    await flush();
    expect(onError).not.toHaveBeenCalled();
    video.frame(300, 0);
    await flush();
    expect(consume).toHaveBeenCalledTimes(2);
    pump.stop();
  });

  it('ferma il ciclo su errore del consumer senza Promise rifiutate non gestite', async () => {
    const onError = vi.fn();
    const pump = new VideoFramePump(video.asElement(), () => { throw new Error('inferenza fallita'); }, onError);
    pump.start();
    video.frame(100, 0);
    await flush();
    expect(onError).toHaveBeenCalledOnce();
    expect(video.callbacks.size).toBe(0);
  });
});
