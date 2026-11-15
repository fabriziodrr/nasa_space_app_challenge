# CrewReady — eyelid vision prototype

## Status and scope

T01 sets up React, TypeScript, Vite, and the Vitest runner. The T03 webcam path now offers explicit start/stop, preview, source selection, and error handling. Preview performs no inference, recording, transmission, or eyelid measurements.

N01 provides contracts and fixtures; N02 adds the pure timing engine, webcam-free replay, and deterministic tests. N03 adds eyelid geometry, admissibility checks, calibration reference collection, and per-eye normalization. N04 adds the MediaPipe adapter, local model and WASM assets, landmark conversion, and structural connection to the T03 source. The UI connects webcam, inference, calibration, and engine for measurement and allows exporting versioned JSON of webcam and synthetic sessions, according to the [plan](../docs/CrewReady_Piano_Implementazione_Visione_Palpebrale.md). Current contracts are established in **C01 v2**. The webcam is aligned to the shared RGBA format via `src/capture/inference-frame-adapter.ts`. Application states, calibration, timing, and buffer properties are defined in [docs/contracts.md](docs/contracts.md); verifiable examples in `fixtures/contract-examples.ts`.

To try the webcam: open the local page, press **Start webcam** and grant access to only the camera in the browser. **Stop** also interrupts an ongoing start. Changing source, hiding the tab, or minimizing the browser stops acquisition; to restart, a new explicit start is required. The **Mirror preview** checkbox changes only the display. Technical details and physical test checklist in [docs/capture.md](docs/capture.md).

For a webcam measurement: start the webcam and press **Prepare analysis**. Start calibration with eyes open, continue with eyes closed, and complete the procedure when the required samples are available. After success, use **Start measurement** and **Stop measurement**. A source change, tab suspension, or webcam stop interrupts analysis and requires a new calibration. The model and runtime are local; physical webcam tests and measurement validation remain to be performed. The **Show eyelid points** checkbox enables the optional overlay. Automatic pipeline tests use simulated inference; real tests remain open.

The **Synthetic replay** section allows selecting a fixture and playing, pausing, or resetting it without a webcam. The graph shows openings and closures; the summary and events are produced by the timing engine. Values are simulated, not measurements obtained from the person in front of the webcam.

The **Export webcam JSON** and **Export synthetic JSON** buttons save the displayed result, samples, and metadata required by the engine. Schema and instructions for a separate consumer are in [docs/integration.md](docs/integration.md). To embed the pipeline in another application, follow the [detailed integration guide](docs/integrare-componente.md).

## Requirements and startup

- Node.js **24.15.0 or later of the 24 series**; `.nvmrc` indicates the verified version.
- npm **11**; version used for the lockfile: **11.12.1**.
- Modern browser with camera access from localhost, 127.0.0.1, or HTTPS.

From the `vision-prototype/` folder:

```powershell
npm.cmd ci
npm.cmd run dev
```

Open `http://127.0.0.1:5173`. Stop the server with `Ctrl+C`.
On Windows use `npm.cmd` if PowerShell blocks `npm.ps1`: no need to change the execution policy. On other systems the same commands work with `npm`.

Initial installation requires the npm registry. Direct dependencies are pinned to exact versions and `package-lock.json` constrains transitive ones. Use `npm.cmd ci` to reproduce the installation; whoever manages T01 maintains dependencies and lockfile. The inference runtime `@mediapipe/tasks-vision@1.2.3` is pinned in the lockfile; model and WASM are already in `public/models/`.

## Commands

| Command | Purpose |
| --- | --- |
| `npm.cmd run dev` | Local Vite server, port 5173 |
| `npm.cmd run typecheck` | TypeScript check of application, configurations, and tests |
| `npm.cmd run build` | Type check and build in `dist/` |
| `npm.cmd run preview` | Serve the build on `http://127.0.0.1:4173` |
| `npm.cmd test` | Single Vitest run |
| `npm.cmd run test:watch` | Vitest in watch mode |

Ports are fixed: if occupied, Vite reports the error. They can be changed with `npm.cmd run dev -- --port 5174` or the equivalent for `preview`.

Vitest uses the **Node** environment, without DOM, suitable for the pure TypeScript engine. It recognizes `tests/**/*.test.ts` and `src/**/*.test.ts`; import `describe`, `it`, `expect` explicitly from `vitest`. Acquisition suites use simulated devices and verify resource release, late permissions, errors, suspension, restart, and frame delivery without queues. The command fails if it does not find tests.

The N02 suites in `tests/analysis/` cover hysteresis, complete and incomplete events, gaps, calibration change, stop, reset, sliding window, and stability across different frequencies. The N03 suites cover EAR formula, scale correction, out-of-image points, implausible ratios, and the calibration procedure with progress, stability, minimum separation, and normalization. The N04 suites use a fake MediaPipe runtime and synthetic landmarks to verify conversion, missing or ambiguous face, errors, release, and provenance metadata.

## N02 timing engine

`src/analysis/` contains a pure TypeScript engine, without DOM, React, webcam, or network. The API is `start`, `processSample`, `getSnapshot`, `stop`, and `reset`; contracts are in `src/contracts/`. The engine calculates valid time, coverage, closed time, closure share, prolonged episodes, and maximum complete closure, distinguishing session and sliding window.

Temporal rules and field names are in [docs/contracts.md](docs/contracts.md); formulas and experimental limits are in [docs/measurement-method.md](docs/measurement-method.md). Synthetic sequences and expected results are in [fixtures/README.md](fixtures/README.md) and can be reproduced with `replayFixture` from `src/analysis/replay.ts`, without a webcam.

### N02 verification — November 13, 2026

Environment: Windows, Node.js 22.18.0 (the project declares series 24; `npm.cmd ci` reported the engine difference only as a warning).

| Check | Result |
| --- | --- |
| `npm.cmd run typecheck` | TypeScript check passed |
| `npm.cmd test` | 2 files, 24 tests passed, including all fixture cases |
| `npm.cmd run build` | Type check and Vite build passed |

Tests cover expected fixture results and rules not expressed by a single sequence: configuration validation, malformed samples, incorrect API usage, restart after reset, gap beyond `maxGapMs`, calibration change, and stability at 10 Hz and 20 Hz. Webcam, real calibration, inference on real model, and performance remain to be verified in tasks N05 and T04-T06.

## Geometry and calibration N03

`src/analysis/geometry.ts` calculates the eyelid aspect ratio EAR from the six points per eye, converts normalized coordinates to pixels to correct image scales, and rejects missing, out-of-image, too narrow eyes, or implausible ratios. Proposed MediaPipe indices are exported for N04, which must verify them.

`src/analysis/calibration.ts` manages guided collection of open and closed phases, progress for T04 screens, per-eye medians, stability, minimum separation, and `open-closed-v1` normalization. A failed outcome exposes distinct reasons per eye, not a usable partial profile.

The formula and checks are in [docs/measurement-method.md](docs/measurement-method.md); the procedure and messages for T04 are in [docs/calibration.md](docs/calibration.md).

### N03 verification — November 13, 2026

| Check | Result |
| --- | --- |
| `npm.cmd run typecheck` | TypeScript check passed |
| `npm.cmd test` | 5 files, 63 tests passed; 13 N03 tests between geometry and calibration |
| `npm.cmd run build` | Type check and Vite build passed |

Tests use synthetic points and observations, without a webcam. Calibration on real people, actual MediaPipe indices, and threshold stability remain to be verified in T04 and N05.

## MediaPipe inference N04

`src/inference/` contains the adapter for MediaPipe Face Landmarker. It loads model and WASM from local paths, converts landmarks to N03 geometry, and handles missing face, multiple faces, missing landmarks, and errors with explicit codes. `createMediaPipeFrameConsumer` consumes the RGBA frame from C01 produced by T03; runtime release remains explicit with `release()`.

Runtime and model are fixed: `@mediapipe/tasks-vision@1.2.3`, model `face_landmarker/float16/1`, SHA-256 `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`, Apache-2.0 license. Details, assets, and Web Worker path in [docs/inference.md](docs/inference.md).

### N04 verification — November 13, 2026

| Check | Result |
| --- | --- |
| `npm.cmd run typecheck` | TypeScript check passed |
| `npm.cmd test` | 12 files, 121 tests passed; 12 N04 tests with fake runtime |
| `npm.cmd run build` | Type check and Vite build passed |
| Local assets | Model present, 3 758 596 bytes and SHA-256 verified; four WASM files copied from package |

Real model, WASM, and GPU/CPU loading in the browser has not been performed here: T04 is connected, but physical webcam testing is needed. The Web Worker path is documented but not implemented.

## N05 validation

`src/validation/` contains the harness to compare annotated closures and engine events, summarize latencies and inference frequency, and produce a JSON report with metrics already calculated by `EngineSnapshot`.

The method, protocol for glasses/reflections/light/rotations/out-of-frame, and synthetic results are in [docs/validation-results.md](docs/validation-results.md). Quantitative validation with webcam and real people has not yet been performed: it requires annotated sessions. Manual tests without annotations remain qualitative.

### N05 verification — November 13, 2026

| Check | Result |
| --- | --- |
| `npm.cmd run typecheck` | TypeScript check passed |
| `npm.cmd test` | 12 files, 121 tests passed; 14 N05 tests |
| `npm.cmd run build` | Type check and Vite build passed |

N05 tests verify one-to-one matching, missed events and false positives, tolerances, completeness differences, latency percentiles, and reports without metric recalculation. They do not attest accuracy on real people.

### C01/N03/N04 merge verification

Merge verification, November 13, 2026: on Node.js 24.15.0 and npm 11.12.1, `npm.cmd run build` (including type check) and `npm.cmd test` passed: **121 tests passed in 12 files**. Tests verify C01 contracts, webcam RGBA, geometric profiles and calibration, N02 engine, synthetic replay T02, N04 adapter with fake runtime, and N05 harness. No manual browser testing was performed.

These dated results are historical. Current verification, including tests for ambiguous faces, C01 v2 states, limits, v2 export, and N05 reports, is reported in [docs/integration.md](docs/integration.md).

## Asset configuration

Default values do not require a `.env` file. To modify them:

```powershell
Copy-Item .env.example .env.local
```

| Variable | Default | Meaning |
| --- | --- | --- |
| `VITE_APP_BASE_PATH` | `/` | Publishing base, with leading and trailing `/` |
| `VITE_MODEL_PATH` | `models/face_landmarker.task` | Local model path |
| `VITE_WASM_PATH` | `models/wasm/` | Local WASM runtime directory |

Relative model and WASM paths are prefixed with the app base in `src/app/runtime-config.ts`. A leading `/` refers them instead to the server root. The module rejects external URLs; the N04 adapter uses `runtimeAssets` when connected to the UI. `VITE_` variables are public and embedded in the build: do not put secrets there. Restart the server after environment changes and rebuild for production.

Example publishing under `/crewready/vision/`: set `VITE_APP_BASE_PATH=/crewready/vision/` in `.env.local`, run the build, and serve `dist/` under that path. `preview` also uses the configured base. Vite handles `BASE_URL` for assets; do not open `dist/index.html` via `file://`.

`public/` is copied to the build. Model `face_landmarker.task`, MediaPipe runtime, and WASM are included in `public/models/`; provenance, checksums, and licenses are in [docs/inference.md](docs/inference.md) and [public/models/README.md](public/models/README.md). The app does not use CDN or remote fonts. Offline operation of the entire pipeline remains to be verified in T06.

## Structure and responsibilities

```text
src/
  app/           avvio e collegamento dei moduli; configurazione asset
  ui/            interfaccia e stili
  capture/       webcam, ciclo dei frame, hook React e test di acquisizione (T03)
  integration/   esportazione e adattatore (T05)
  contracts/     contratti condivisi (N01/C01)
  analysis/      motore, geometria, calibrazione, configurazione e replay (N02/N03)
  inference/     adattatore MediaPipe, conversione e consumer T03 (N04)
  validation/    confronto eventi, metriche prestazioni e report (N05)
public/models/   modello e WASM locali verificati (N04)
fixtures/        sequenze sintetiche e risultati attesi (N01/N02)
tests/analysis/  test deterministici di motore, fixture, geometria e calibrazione
src/inference/   test N04 con runtime finto, senza WASM o webcam
tests/validation/ test N05 di matching, tolleranze e prestazioni
tests/integration/ verifiche applicative (T05/T06)
docs/            contratti, metodo, calibrazione, inferenza e validazione
```

Producers and consumers use C01 v2 contracts from `docs/contracts.md`. Incompatible variations require a new version and updating involved modules and fixtures. N03 provides geometry and calibration on this boundary; N04 consumes RGBA frames for inference. T02 UI can proceed with the engine and synthetic replay.

The specification `CrewReady_Feature_Visione_Palpebrale.md`, cited by the plan, is not present in the repository at the time of T01.

## T01 verification — November 13, 2026

Environment: Windows, Node.js 24.15.0, npm 11.12.1.

| Check | Result |
| --- | --- |
| `npm.cmd ci` | Clean installation from lockfile succeeded |
| `npm.cmd run build` | TypeScript check and build succeeded |
| `npm.cmd test` | Runner started; no tests yet |
| Development server | HTTP 200 for page and application modules |
| Build preview | HTTP 200 for page with compiled asset references |
| Base `/crewready/vision/` | Page and asset configuration served from subpath in development |

These are structure, compilation, and HTTP service verifications. Visual browser testing, webcam, and pipeline performance remain to be performed in subsequent tasks. Servers used for verifications were stopped.
