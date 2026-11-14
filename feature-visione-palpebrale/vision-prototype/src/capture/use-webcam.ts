import { useCallback, useEffect, useRef, useState } from 'react';
import { initialWebcamSnapshot, WebcamCapture } from './webcam';
import type { InferenceFrameConsumer } from '../contracts/frame';
import type { WebcamSnapshot } from './webcam';

export function useWebcam(consumer?: InferenceFrameConsumer, onCaptureState?: (state: WebcamSnapshot) => void, shouldConsume?: () => boolean) {
  const consumerRef = useRef(consumer);
  const stateRef = useRef(onCaptureState);
  const enabledRef = useRef(shouldConsume);
  consumerRef.current = consumer;
  stateRef.current = onCaptureState;
  enabledRef.current = shouldConsume;
  const videoRef = useRef<HTMLVideoElement>(null);
  const captureRef = useRef<WebcamCapture | null>(null);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const [snapshot, setSnapshot] = useState(initialWebcamSnapshot);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceMessage, setDeviceMessage] = useState('');
  const [deviceId, setDeviceId] = useState('');

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let mounted = true;
    const capture = new WebcamCapture(video, (state) => {
      setSnapshot(state);
      stateRef.current?.(state);
    }, (frame, signal) => {
      if (consumerRef.current) return consumerRef.current(frame, signal);
      frame.release();
    }, () => enabledRef.current?.() ?? true);
    captureRef.current = capture;
    const mediaDevices = navigator.mediaDevices;
    const refresh = async () => {
      if (!mediaDevices?.enumerateDevices) return;
      try {
        const available = await mediaDevices.enumerateDevices();
        if (!mounted) return;
        setDevices(available.filter((device) => device.kind === 'videoinput' && device.deviceId));
        setDeviceMessage('');
      } catch {
        if (mounted) setDeviceMessage('Elenco fotocamere non disponibile. Puoi provare la sorgente predefinita.');
      }
    };
    refreshRef.current = refresh;
    void refresh();
    const onDeviceChange = () => { void refresh(); };
    mediaDevices?.addEventListener?.('devicechange', onDeviceChange);
    return () => {
      mounted = false;
      capture.dispose();
      captureRef.current = null;
      refreshRef.current = async () => {};
      mediaDevices?.removeEventListener?.('devicechange', onDeviceChange);
    };
  }, []);

  const start = useCallback(() => {
    const capture = captureRef.current;
    if (capture) void capture.start(deviceId).then(() => refreshRef.current());
  }, [deviceId]);

  const stop = useCallback(() => { captureRef.current?.stop(); }, []);

  const selectDevice = useCallback((nextDeviceId: string) => {
    captureRef.current?.stop('Sorgente cambiata. Premi Avvia per accendere la fotocamera selezionata.', 'source_changed');
    setDeviceId(nextDeviceId);
  }, []);

  return { videoRef, snapshot, devices, deviceMessage, deviceId, start, stop, selectDevice };
}
