# Integrating the eyelid vision component

This guide describes how to incorporate the prototype pipeline into another web application. The component is not yet published as an npm package: it must be integrated from the repository, keeping the TypeScript modules together with the local model assets. The guide distinguishes between using the ready-made React app and reusing the pipeline within an existing application.

## What is integrated

The pipeline processes webcam frames locally and produces calibrated eyelid samples, temporal events, and summaries:

```text
Webcam → frame RGBA → MediaPipe Face Landmarker → geometria occhi
       → calibrazione → campioni normalizzati → motore temporale
       → snapshot / grafico / export JSON
```

No video or images are transmitted. The export contains data and metadata, not frames or raw landmarks. The engine and contracts do not depend on React; acquisition, UI, and MediaPipe runtime are separate adapters.

## Choosing the integration mode

If the host app is compatible with React 19, TypeScript, and Vite, the simplest path is to deploy `vision-prototype/` as a standalone app and embed it in the application using the product's intended mode, for example a route or an iframe. This keeps UI, Vite configuration, and assets intact. With an iframe, the host must allow camera access and a secure context; verify permissions at deployment time.

If the existing UI must control the feature directly, integrate the source modules and connect them to the host components. Do not copy only `LiveSession`: include contracts, acquisition, runtime, and assets. The modules are internal sources, not a stable library; pin the repository revision and re-check contracts at every update.

## Requirements and assets

- TypeScript with ES modules; for the provided UI: React 19 and Vite 8.
- `@mediapipe/tasks-vision` at the version pinned in `vision-prototype/package.json` and in the lockfile.
- Modern browser with webcam access from `localhost`, `127.0.0.1`, or HTTPS.
- Face Landmarker model and WASM runtime served locally, from the same origin as the app.

The prototype keeps the model and WASM in `public/models/`; provenance, license, and checksum are in [`../public/models/README.md`](../public/models/README.md). Copy both assets into the host's public folder and keep paths consistent with the deployment base URL. Avoid CDN URLs for these assets. `VITE_` build variables are public and must not contain secrets.

To start the prototype:

```sh
cd vision-prototype
npm ci
npm run dev
```

In PowerShell, if `npm.ps1` is blocked, use `npm.cmd`. Subpath and asset configuration is described in the [prototype README](../README.md#configurazione-degli-asset).

## Connecting the pipeline to the existing UI

### 1. Bring the modules and respect the contracts

Include `src/contracts/`, `src/analysis/`, `src/inference/`, `src/capture/`, `src/validation/`, and, if export is needed, `src/integration/`. Avoid redefining types such as `AnalysisSample`, `ApplicationSessionSnapshot`, or geometry: they must pass through modules without implicit conversions. The current contract is C01 v2; exports are `crewready-session-v2`.

### 2. Create the local runtime

Use `MediaPipeFaceLandmarkerAdapter` with the configuration in `src/inference/config.ts` and the runtime in `src/inference/mediapipe-runtime.ts`. Model and WASM paths must resolve to locally distributed files. Await `init()` before analysis and call `release()` at the end or in case of interruption.

The prototype resolves paths in `src/app/runtime-config.ts`; the full connection is in `src/app/App.tsx` and `src/app/live-session.ts`. These are application details, not a stable public API.

### 3. Connect the webcam

Use `useWebcam` and the adapters in `src/capture/` to obtain RGBA frames with monotonic timestamps. The consumer must always release every frame, even in case of error or cancellation. `LiveSession.consume` applies this rule.

Start acquisition only after an explicit user action. Handle denied permission, missing webcam, device change, hidden page, and stop as distinct states: suspensions and errors must not be shown as a normal stop. Camera use requires a secure context; do not open the build via `file://`.

### 4. Calibrate before measuring

Calibration collects references for open and closed eyes. In the provided session the flow is `startOpen()` → collect samples → `startClosed()` → collect samples → `finishCalibration()`. Start measurement only with a valid profile. A resolution change or interruption invalidates calibration and requires a new procedure. Show progress and reasons for insufficient calibration, including interruption.

### 5. Start and stop measurement

After a valid calibration, `startMeasurement()` starts `TemporalEngine`. Processed frames are converted with `toAnalysisSample()` and offered to the engine. `LiveSnapshot` exposes phase, calibration, last sample, engine snapshot, progress, interruptions, and errors. Alternatively, connect `TemporalEngine` directly using the contracts in `src/contracts/engine.ts` and `src/contracts/sample.ts`.

Measurement ends with `stopMeasurement()` or with an interruption. The session automatically stops at 18,000 samples and retains data for export. The chart is limited to 2,000 points. These limits alone do not demonstrate adequate performance for every device or duration.

### 6. Show results

Use `EngineSnapshot` for coverage, valid time, closure share, and events. `null` values indicate unavailable data and must not be converted to zero. Units are milliseconds, normalized opening, and fractions between 0 and 1. The host UI may have a different look, but it should not recalculate events from chart points.

### 7. Export or consume a session

`LiveSession.exportSnapshot(snapshot)` prepares the webcam package from the displayed snapshot. `createSessionExport()` is the UI-independent adapter; `serializeSessionExport()` produces JSON and `summarizeExport()` shows an example read. `parseSessionExport(jsonText)` validates format, limits, and consistency by replaying samples in the engine.

The parser supports C01 v2 and session v2, up to 18,000 samples and 50 million characters. Verification is synchronous and checks consistency, but does not authenticate the sender. v1 exports are not accepted by the v2 parser. Schema and consumer example are described in [`integration.md`](integration.md).

`createSessionValidationReport()` from `src/validation/session-report.ts` creates the N05 report. Without annotations it does not declare accuracy metrics. Synthetic tests and those with simulated runtime do not replace validation on annotated webcam sessions.

## Pre-delivery checks

In the prototype folder:

```sh
npm ci
npm run typecheck
npm test
npm run build
```

In the actual deployment, verify startup with webcam permission, calibration, measurement, stop, restart, errors, and source change; offline operation after app load; URLs under the expected subpath; absence of CDN requests; resource release and JSON download. Build and automatic tests do not prove these cases in the browser nor measurement quality on real people. The checklist is in [`validation-results.md`](validation-results.md) and [`capture.md`](capture.md).

## Limits

- The pipeline is experimental, not diagnostic or clinical; thresholds and performance must be evaluated for the real use case.
- There is no npm package yet with a versioned API: the host must pin the integrated revision and verify updates.
- The MediaPipe path in Web Worker is not implemented; inference uses the runtime in the main thread.
- Export allows replaying the engine from calibrated samples, not the video or raw inference.
- T06 requires final testing, including offline and subpath; N05 quantitative requires annotated data.
