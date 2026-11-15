# MediaPipe Inference — N04

Version: **N04**, November 13, 2026. The adapter is in `src/inference/`; the target geometry is that of N03. T04 connects the adapter to UI and calibration; testing with a real webcam remains to be done. This is not clinical validation.

## 1 Fixed Choices

| Item | Value |
| --- | --- |
| Runtime | `@mediapipe/tasks-vision` |
| Runtime version | `1.2.3` (exact in `package.json` and lockfile) |
| Runtime license | Apache-2.0 |
| Model | MediaPipe Face Landmarker, float16 |
| Model identifier | `face_landmarker/float16/1/face_landmarker.task` |
| Model size | 3 758 596 bytes |
| Model SHA-256 | `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff` |
| Model license | Apache-2.0 |
| Geometric method | `n03-ear-v1` |

Provenance:

- runtime: `https://www.npmjs.com/package/@mediapipe/tasks-vision/v/1.2.3`
- model:
  `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`
- MediaPipe licenses and terms: `https://github.com/google-ai-edge/mediapipe`

The values are exported from `src/inference/mediapipe-runtime.ts` and are inserted into the adapter metadata. A model or runtime update requires a new verification and updating checksum, version, and tests.

## 2 Local Assets

Files are included in `public/models/`:

```text
public/models/
  face_landmarker.task
  wasm/
    vision_wasm_internal.js
    vision_wasm_internal.wasm
    vision_wasm_module_internal.js
    vision_wasm_module_internal.wasm
  README.md
```

`public/` is copied into the build. There are no CDN requests during execution: model and WASM are served from the same origin as the app.

The adapter does not embed paths or environment variables. T04 passes the paths resolved from `src/app/runtime-config.ts`:

```ts
import { runtimeAssets } from '../app/runtime-config';
import { MediaPipeFaceLandmarkerAdapter } from '../inference';

const adapter = new MediaPipeFaceLandmarkerAdapter({
  modelAssetPath: runtimeAssets.modelPath,
  wasmAssetPath: runtimeAssets.wasmPath,
});
```

Local model verification:

```powershell
(Get-FileHash public\models\face_landmarker.task -Algorithm SHA256).Hash.ToLower()
(Get-Item public\models\face_landmarker.task).Length
```

## 3 API and Lifecycle

```ts
const adapter = new MediaPipeFaceLandmarkerAdapter(config);
await adapter.init();                 // carica modello e WASM
adapter.processFrame(frame, signal);  // consuma un InferenceFrame RGBA di C01
adapter.release();                    // chiude il runtime

adapter.getStatus();                  // stato, frame, ultimo numero di volti, errore
adapter.getProvenance();              // versioni, licenze, checksum, configId
```

- `init()` is idempotent; concurrent calls share the same Promise.
- `release()` shuts down the runtime. A load that completes after release is closed without being used. After `release()`, a new `init()` is possible.
- `processFrame()` is synchronous and uses the RGBA buffer of `InferenceFrame`. An already cancelled frame returns `{ status: 'cancelled' }` without calling the runtime.
- Non-increasing timestamps, malformed frames, already released buffers, use before `init()`, and runtime errors throw `InferenceError` with an explicit `code`.

`createMediaPipeFrameConsumer(adapter, onResult)` adapts the adapter to `InferenceFrameConsumer` from C01. The pump delivers one frame at a time; the adapter does not create queues and the consumer releases the buffer in a `finally`. The session owner calls `release()` on stop.

## 4 Conversion and No-Face Cases

`convertFaceLandmarkerResult` is a pure function:

| MediaPipe Output | Result |
| --- | --- |
| No face | `no_face`, both eyes invalid with `not_tracked` |
| Multiple faces | `ambiguous`, both invalid with `ambiguous_face`; no face selected |
| Fewer than 388 landmarks | `invalid_landmarks`, reason `landmark_missing` |
| Points outside image | `invalid_landmarks` or partial validity, reason `out_of_range` |
| Usable face | `face`, EAR per eye according to N03 |

The result always contains `FaceGeometryObservation`. Calibration and the engine can therefore receive an invalid observation, without confusing an absent face with open eyes.

## 5 Web Worker Path

This is not the default path in N04. It is compatible with the project and must be verified in T04/T06:

1. the main thread receives `InferenceFrame` RGBA from C01 and transfers `pixels.data.buffer`, `width`, `height`, and `timestampMs` to the Worker;
2. the Worker reconstructs `ImageData` and uses the same MediaPipe model;
3. converts with `convertFaceLandmarkerResult` and returns the geometry;
4. the main thread ignores results from cancelled sessions and releases the C01 frame according to the contract.

Requirements and limits: `OffscreenCanvas`/WebGL2 support for the GPU path, buffer copy or transfer cost, need for an explicit queue between threads, and cancellation handling. The CPU configuration can work without WebGL2. T03 already produces RGBA via `inference-frame-adapter.ts`; the Worker is not implemented in N04.

## 6 Behavior and Limits

- `numFaces` default is 2: it serves to recognize the presence of multiple faces and reject the ambiguous observation. With `numFaces: 1` this ambiguity is not detected.
- `delegate` default is `CPU` to reduce WebGL2 dependencies. `GPU` is configurable and must be verified on the target browser.
- The model may lose the face with glasses, reflections, rotations, or occlusion. N04 does not interpret these cases as closed eyes: it produces explicit invalidity.
- The timestamp is that of the T03 pump (`performance.now()`), not sensor time. The N02 engine uses the same timestamps.
- The adapter does not handle webcam, calibration, overlay, or export.
- Real performance and landmark accuracy require N05.

## 7 Automated Verifications

Tests in `src/inference/inference.test.ts` use a mock runtime and synthetic landmarks; they do not load WASM, model, or DOM:

- open/closed eye conversion with expected EAR;
- absent face, insufficient landmarks, multiple faces, and out-of-image points;
- idempotent init, cancelled frames, non-monotonic timestamps, and malformed frames;
- load and inference errors, release and new init;
- provenance metadata, version, checksum, and license.

Commands executed on November 13, 2026:

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

## 8 To Verify with T04/N05

- Real connection of `runtimeAssets` and the RGBA C01 consumer to the webcam pump.
- Offline loading of model and WASM after build.
- CPU/GPU choice, latency, and inference frequency on the test PC.
- Possible switch to Worker and related queue/buffer transfer.
- Robustness with glasses, reflections, lighting, and rotations.
