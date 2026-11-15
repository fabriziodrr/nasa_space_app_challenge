# Webcam acquisition — T03

## Status

The application part is implemented and aligned with **C01 v2**. The public boundary toward inference uses `InferenceFrame` RGBA from `src/contracts/`; the borrowed video frame remains an internal detail of `src/capture/`. Testing with a physical webcam remains the user's responsibility.

## Visible behavior

- Access is requested only when pressing **Start webcam**, with `audio: false`.
- Startup goes through authorization, video preparation, and active preview.
- **Stop** is available also during permission request or startup.
- The default source works even if the browser does not yet expose the device list; labels are updated after authorization.
- Changing source stops and releases the previous one, without automatically starting the new one. The list is also updated on `devicechange`.
- Mirroring the preview uses only CSS: the source for analysis remains original.
- A hidden tab, `pagehide`, or `freeze` interrupt acquisition and release all tracks. Returning to the page does not turn the camera back on.
- Track revocation/interruption, signal loss, video errors, and consumer errors stop the webcam and show a recoverable message.
- Calibration, inference, measurements, overlay, and export are connected to the UI; manual testing on a physical webcam remains to be performed.

Resolution and number of received frames describe only acquisition. They do not attest eye evaluability or availability of a measurement.

## Components and responsibilities

`webcam.ts` manages stream, playback, messages, listeners, and release.
`video-frame-pump.ts` delivers new images to the consumer.
`inference-frame-adapter.ts` copies the video into C01-compliant RGBA buffers.
`use-webcam.ts` connects the source to the React video and updates the device list.
`app/App.tsx` manages visible controls and does not compute eyelid metrics.

`getUserMedia` ideally requests 1280 × 720 and 30 fps, without imposing them; the browser may return another format. Explicit device selection uses its exact identifier. The video has `muted` and `playsInline`.

Stop, error, and unmount remove track listeners, clear the frame callback, invoke `stop()` on all tracks, and zero `video.srcObject`. Generation identifiers prevent old responses from overwriting a subsequent start. If a permission arrives after stop or unmount, the related stream is immediately stopped without being shown.

The browser does not offer direct cancellation of the `getUserMedia` Promise: its prompt might remain visible after **Stop**. The app invalidates the request and releases any stream as soon as it arrives. For `video.play()`, it waits at most 15 seconds; the wait ends immediately on stop, even if the Promise remains pending.

## C01 interface for the consumer

The optional third argument of the `WebcamCapture` constructor accepts an `InferenceFrameConsumer`, independent of React. The current UI uses the null consumer, which only updates counter and dimensions. Tests also use slow and fallible consumers, without webcam or inference.

```ts
import { WebcamCapture } from '../capture/webcam';

const capture = new WebcamCapture(videoElement, updateView, (frame, signal) => {
  try {
    if (signal.aborted) return;
    // N04 usa questi pixel RGBA tramite createMediaPipeFrameConsumer.
    console.debug(frame.timestampMs, frame.width, frame.height, frame.pixels.format);
  } finally {
    frame.release();
  }
});

await capture.start();
capture.stop();
capture.dispose(); // allo smontaggio del consumatore
```

| Field | Meaning |
| --- | --- |
| `frameId` | Positive increasing integer per acquisition instance |
| `source` | Origin `webcam` |
| `width`, `height` | Real video dimensions in pixels |
| `timestampMs` | Monotonic callback time relative to `performance.timeOrigin`, in ms |
| `pixels` | Independent RGBA sRGB buffer, four bytes per pixel |
| `release()` | End of buffer use; idempotent |

The consumer's second argument, `signal`, is invalidated on stop or session change. `mediaTimeSeconds` is used only for internal deduplication.

It is not a sensor timestamp. Timestamps are not converted into closure durations: this responsibility lies with the N02 engine.

The adapter copies the original video before the first `await`, via a canvas not added to the page. The canvas is created only when a consumer is actually connected: preview alone does not allocate RGBA copies. Each buffer remains valid until `release()`, then it is no longer used. The adapter also releases forgotten or error-involved buffers after consumer completion.

For a Worker, `pixels.data.buffer` is transferred with metadata; `release` and `signal` remain in the page. The consumer awaits end-of-processing confirmation, ignores cancelled results, and releases the frame in a `finally`. Stop does not forcefully interrupt a Promise and does not release pixels the consumer is using.

`requestVideoFrameCallback` is used when available. The fallback uses `requestAnimationFrame`, discards already-seen `currentTime`, and also uses `getVideoPlaybackQuality().totalVideoFrames` when the browser provides it. If the frame counter is not available, the `currentTime`-based fallback is an approximate deduplication, to be verified on the target browser.

During asynchronous processing, no other images are queued. Preview continues and the next callback is requested at the end of the consumer. Even after a restart, the end of the previous consumer is awaited before delivering another frame: adapters must therefore terminate or respect cancellation. Duplicate/non-increasing timestamps and unready images are discarded; gaps remain observable, without generating intermediate samples.

## Automated checks

Checks executed on November 13, 2026 on Windows, Node.js 24.15.0, npm 11.12.1. No new dependencies.

- `npm.cmd run build`: TypeScript check and production build succeeded.
- `npm.cmd test`: **26 tests passed**, suite in `src/capture/webcam.test.ts`, with track, stream, video callback, RAF, visibility, and permissions simulated.
- Covered cases: explicit start without audio, release on stop, late grant, `play` cancellation, errors and retry, track interruption, suspension, unmount, restarts, timeout, missing API/insecure context, slow or fallible consumer, old errors, duplicates, timestamps, and fallback.
- Development server: HTTP 200 for page, component, and acquisition modules updated on `http://127.0.0.1:5173`.
- Brave: page loaded, Start/Stop controls, source, and mirror present; initial state Off with Stop disabled. Physical webcam access not activated during this check.

The C01 review adds automated checks of the webcam/RGBA boundary: copy, buffer properties, release, errors, cancellation, and buffer transfer with `structuredClone`. No additional manual test is performed by the agent.

These checks verify software behavior with simulated APIs. They do not certify hardware, the permission prompt, or browser performance.

## Manual testing to be performed

1. Start the project with `npm.cmd run dev` and open `http://127.0.0.1:5173`.
2. Verify that before clicking, the webcam does not turn on and audio is not requested.
3. Press **Start webcam**, allow access, and verify preview, dimensions, and counter; try mirroring without changing the source.
4. Press **Stop** and verify webcam shutdown and preview clearing. Repeat start/stop at least three times.
5. Change camera, if available: the previous one must stop and the new one must require the **Start** button.
6. Switch to another tab or minimize the browser: on return, the camera must be off and the state must explain the interruption.
7. Deny permission and verify the message; manually correct permissions in the browser and retry. Also try **Stop** during the prompt.
8. Disconnect the webcam or revoke permission during preview and verify stop and message. Reload/close the page verifying release.

Record browser, device, and results before declaring T03 complete.

## API references

- [getUserMedia and permission requests](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- [Video frame callback](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback)
- [Track release](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/stop)
- [Page visibility](https://developer.mozilla.org/en-US/docs/Web/API/Document/visibilitychange_event)
