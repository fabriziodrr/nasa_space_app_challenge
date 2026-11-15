# Eyelid vision implementation plan for two developers

**Project:** autonomous eyelid observation prototype for CrewReady
**Participants:** You and Nervo
**Version:** 1.0 of November 13, 2026
**Reference:** [Feature Specification](CrewReady_Feature_Visione_Palpebrale.md)
**Status:** operational plan; tasks and verifications still to be executed.

The work is divided into two parallel tracks: **you implement application, acquisition, interface, and export; Nervo implements inference, calibration, and measurement engine**. A shared contract allows developing the interface with synthetic data while computer vision is prepared.

The result is a local application in the `vision-prototype/` folder, with local assets and reusable analysis. Full integration into CrewReady and inference execution on Arduino UNO Q are subsequent to the first delivery.

## 1 Deliverable

- TypeScript application with React and Vite, runnable locally.
- Webcam with explicit start and stop, preview, and optional overlay.
- Guided technical calibration and distinct states for usable or insufficient data.
- Opening of both eyes, bilateral closures, durations, coverage, and closure time share.
- Chart with non-evaluable intervals and session summary.
- Reproducible synthetic mode, available even without webcam.
- Versioned JSON export with configuration and calibration necessary for reproduction.
- Separate consumer example, engine test, and test documentation.

The measures describe the observed eyelid behavior. The UI must not transform them into fatigue percentages, diagnoses, or suitability assessments. The closure share must retain the name and experimental method indicated in the specification.

## 2 Responsibilities and file ownership

| Area | Primary owner | Review |
| --- | --- | --- |
| Project structure, dependencies, build, and commands | You | Nervo verifies runtime requirements |
| Contracts and temporal semantics | Nervo | You verify UI consumption |
| Webcam, frames, and acquisition resource release | You | Nervo verifies timing and format |
| MediaPipe, geometry, and model assets | Nervo | You verify app connection |
| Calibration, states, events, and metrics | Nervo | You review examples and results |
| Interface, charts, and session control | You | Nervo verifies measure meaning |
| Export and integration adapter | You | Nervo verifies units and metadata |
| Deterministic engine tests and fixtures | Nervo | You verify replay mode |
| Full testing and documentation | Both | Cross-review |

Proposed structure, with primary owner in parentheses:

```text
vision-prototype/
  package.json                 (Tu)
  package-lock.json            (Tu)
  vite.config.ts               (Tu)
  tsconfig*.json               (Tu)
  src/
    contracts/                 (Nervo, con revisione di entrambi)
    capture/                   (Tu)
    inference/                 (Nervo)
    analysis/                  (Nervo)
    integration/               (Tu)
    ui/                        (Tu)
    app/                       (Tu: collegamento dei moduli)
  public/models/               (Nervo)
  fixtures/                    (Nervo)
  tests/
    analysis/                  (Nervo)
    integration/               (Tu)
  docs/
    contracts.md               (Nervo)
    measurement-method.md      (Nervo)
    calibration.md             (Nervo)
    integration.md             (Tu)
    validation-results.md      (Entrambi, sezioni separate)
  README.md                    (Tu, con contributi di Nervo)
```

Ownership serves to reduce conflicts: whoever must intervene in another's area agrees on the change first. For shared files, one change is integrated at a time.

## 3 Initial agreement that unlocks parallel work

### C01 Set the minimum contract

**Owners:** both; Nervo prepares types and examples, you review them from the application perspective.
**Dependencies:** none.

Agree before connecting real modules:

1. **Input frame to inference:** accepted representation, dimensions, monotonic millisecond timestamp, and responsibility for releasing any buffer. The contract must be able to support a Web Worker without imposing it on the timing engine.
2. **Engine sample:** timestamp, calibrated opening for each eye, evaluability per eye, invalidity reasons, and calibration ID. Also document units and range of geometric values before calibration.
3. **Engine API:** signatures of `start`, `processSample`, `getSnapshot`, `stop`, `reset`; error handling and rejected samples.
4. **Results:** UI update, complete or incomplete event, versioned summary; units and meaning of `null`.
5. **Time:** attribution of intervals between samples, duplicate or out-of-order timestamps, maximum gap, transitions, and interruptions. No lost time is reconstructed as certain closure.
6. **Windows:** distinguish entire session and sliding window; declare how to treat an event crossing the window boundary. A truncated closure must not appear as a shorter complete event.
7. **Calibration:** opening and closing references, minimum separation, version, and invalidation conditions. A calibration change interrupts measurement continuity.
8. **Configuration:** parameter names, allowed ranges, and identification of values actually used. Initial values remain experimental and are justified in testing.
9. **Application session:** loading, preview, calibration, measurement, stop, and error states. Define what happens if the tab is suspended or the user changes camera.

**Deliverable:** types in `src/contracts/`, rules in `docs/contracts.md`, and consistent sample, event, and summary examples, including an unavailable case.

**Complete when:** both can write a fake producer or consumer without inventing fields or interpretations. Before C01 you can work on structure and static screens; after C01 the two tracks proceed independently.

**Status as of November 13, 2026:** C01 v1 established on delegation of the application owner. Decisions and semantics in `vision-prototype/docs/contracts.md`, types in `src/contracts/`, examples in `fixtures/contract-examples.ts`, and webcam/RGBA adapter in `src/capture/inference-frame-adapter.ts`. N03 implements geometry and calibration on this boundary; N04 will add inference.

## 4 Your tasks

### T01 Prepare the project

**Dependencies:** none; executable while Nervo prepares C01.

- Create the React and TypeScript project with Vite, verifying environment requirements.
- Configure build, type checking, and test runner agreed with Nervo.
- Pin versions and lockfile; set up configurable paths for model and WASM.
- Prepare folder structure and initial startup instructions.

**Deliverable:** runnable minimal project and successful build. Runtime dependencies requested by Nervo are added by you, so the lockfile has a single owner.

### T02 Build interface with a fake adapter

**Dependencies:** T01 and C01.

- Prepare controls, video, two-eye values, chart, summary, and quality detail.
- Use a contract-compliant fake producer to simulate available measurement, insufficient calibration, signal loss, and error.
- Handle buttons according to session state and avoid presenting demo values as real measurements.

**Deliverable:** navigable and verifiable screen without MediaPipe. Temporary fake data will be replaced by Nervo's official fixtures.

### T03 Implement acquisition and session cycle

**Dependencies:** T01 and C01 frame contract.

- Request only the webcam, handling denied permission and unavailable device.
- Send new frames with monotonic timestamps; agree on alternative path if chosen API is unavailable.
- Apply one-processing-at-a-time rule, avoiding frame accumulation.
- Handle start, stop, source change, suspension, and camera release.

**Deliverable:** frame source connectable to Nervo's adapter, verified also with a fake consumer.

**Progress as of November 13, 2026:** application part implemented in `vision-prototype/src/capture/`, with UI and 26 passing automatic tests. Frame format aligned to C01 with RGBA adapter; current application contract version is v2. Physical webcam testing remains, to be carried out by the user. Details in `vision-prototype/docs/capture.md`.

### T04 Connect calibration and results to UI

**Dependencies:** T02, T03, N02, N03, and N04 for full pipeline. Connection can start using fake adapters.

- Implement calibration screens using logic provided by Nervo.
- Connect pipeline webcam → inference → calibration → engine → interface.
- Show overlay, technical states, and chart interruptions without duplicating engine calculations.
- Also connect synthetic mode: changes source, same engine.

**Deliverable:** first complete webcam session and first reproducible session with fixtures.

### T05 Implement export and separate consumer

**Dependencies:** C01; full verification with N02 and N03.

- Export engine-produced summary together with resolvable configuration and calibration references, or relative objects in the exported package.
- Preserve synthetic or webcam origin, versions, units, period, and unavailability reasons.
- Create a separate consumer that receives the object from the adapter, without reading React components or global variables.
- Verify serialization and consistency between displayed and exported result.

**Deliverable:** usable JSON and adapter instructions in `docs/integration.md`.

**Progress T05:** webcam export and synthetic replay implemented, with profile, configurations, samples, versions, and separate consumer. Automatic tests verify serialization and reproduction; manual download test remains, to be carried out by the user. Details in `vision-prototype/docs/integration.md`.

### T06 Verify application and prepare delivery

**Dependencies:** T04, T05, and N05.

- Verify startup and measurement without Internet after installation and local asset availability.
- Check subpath loading, stop, restart, errors, and absence of involuntary CDN requests.
- Record UI responsiveness and behavior during repeated sessions.
- Complete README and application section of test results.

**Deliverable:** runnable build, reproducible instructions, and documented application limits.

## 5 Nervo's tasks

### N01 Define contracts and reference fixtures

**Dependencies:** none for proposal; C01 review before considering them stable.

- Prepare types and examples required by C01.
- Create synthetic sequences with expected results: open, short closures, prolonged closure, blink, tracking loss, time gap, and null valid time.
- Add duplicate or out-of-order timestamps, stop during closure, and calibration change.
- Make fixtures consumable by replay without webcam.

**Deliverable:** initial contracts approved by both and fixtures with documented expected results.

### N02 Implement timing engine

**Dependencies:** C01 and N01. Does not depend on webcam or UI.

- Implement per-eye states, hysteresis, and bilateral closure.
- Handle continuity, incomplete events, gaps, stop, and reset.
- Calculate valid time, coverage, closed time, closure share, prolonged episodes, and maximum complete closure.
- Separate session aggregates and sliding window according to C01.
- Verify temporally equivalent sequences at different frequencies, within sampling limits.

**Deliverable:** pure TypeScript engine with deterministic expected-result tests. No dependency on DOM, React, webcam, or network.

### N03 Implement geometry and calibration

**Dependencies:** C01. Calculations can be developed with synthetic points before N04.

- Select and document eyelid points, formula, and image scale correction.
- Define geometric admissibility checks and limits of their automatic recognition.
- Implement open and closed reference collection, minimum separation, and per-eye normalization.
- Expose progress, outcome, and calibration failure reasons for T04 screens.

**Deliverable:** separately verifiable functions, procedure in `docs/calibration.md` and method in `docs/measurement-method.md`.

### N04 Implement MediaPipe adapter

**Dependencies:** T01 and C01; collaboration with you for dependencies and asset loading.

- Select and pin model and runtime; record provenance, version, verifiable identifier, and licenses.
- Load model and WASM from configurable local paths.
- Convert MediaPipe output to geometry expected by N03; handle absent face or ambiguous observation.
- Expose initialization, processing, and resource release without UI dependencies.
- Evaluate inference in Web Worker and document compatible alternative path.

**Deliverable:** adapter connectable to T03 source, with explicit errors and releasable resources.

### N05 Validate measurement and inference performance

**Dependencies:** N02, N03, N04; collaboration with you after T04.

- Compare controlled events and results, using manual annotations when available.
- Test glasses, reflections, lighting, rotations, and out-of-frame exit.
- Record inference frequency, latency, coverage, and main false detections or missed events.
- Document experimental parameters, machine, browser, model, and verification limits.

**Deliverable:** measurement section in `docs/validation-results.md`. Manual tests without annotations are not presented as quantitative accuracy validation.

## 6 Parallel work order

Rows indicate work cycles, not days or deadlines. Durations depend on available time and runtime difficulties.

| Cycle | You | Nervo | Integration point |
| --- | --- | --- | --- |
| Start | T01 project structure | N01 contract proposal | C01 review and stabilization of minimum contract |
| First development | T02 fake UI and T03 acquisition | N02 engine and fixtures | UI displays engine results on synthetic data |
| Visual pipeline | T05 export and T04 preparation | N03 geometry and calibration, N04 MediaPipe | Webcam and adapter exchange frames and compliant observations |
| Full connection | T04 calibration, charts, and session | Completion of N03 and N04, connection support | First complete and exportable webcam session |
| Delivery | T06 application and README | N05 measurement and performance | Joint testing and final review |

If MediaPipe takes longer, you can complete UI, replay, and export using the engine and fixtures. If the interface takes longer, Nervo can continue verifying measurement and inference through a minimal technical consumer.

## 7 Practical collaboration rules

1. **One owner for base project.** You manage configuration, dependencies, and lockfile. Nervo communicates requirements before changes.
2. **Shared contracts and explicit changes.** Nervo proposes a variation indicating which producers and consumers change; both review it before integration. Incompatible schema changes require a new version.
3. **Development on separate branches.** After setting up a shared repository, use for example `feature/vision-app` and `feature/vision-engine`. Integrate first structure and contracts, then small groups of completed tasks.
4. **Small and verifiable deliveries.** Each step reports task, affected files, how to test it, expected result, and still-open limits.
5. **Single metric calculation.** UI and export consume the same engine result; they do not recalculate durations or percentages.
6. **Recorded tests.** Every result distinguishes fixture, voluntary closures, and spontaneous observations; reports configuration and versions.
7. **Cycle coordination.** At the start of each cycle compare completed activities, dependencies, and contract changes. Do not wait for final delivery to connect the two tracks.

## 8 Final joint verification

| Criterion | Who prepares verification | Completion condition |
| --- | --- | --- |
| Deterministic calculations | Nervo | Fixtures, events, gaps, and aggregates match expected results |
| Calibration | Nervo | Distinguishable conditions accepted; insufficient references rejected with reason |
| Application session | You | Start, stop, restart, and error handling work without active resources left |
| Visible quality | You | Missing data and invalid intervals are distinguishable from open eyes |
| Result consistency | Both | UI, replay, and export use the same engine results |
| Local operation | You | Model and runtime loaded without CDN during execution |
| Performance | Both | Measurements recorded on test PC and acceptable behavior versus agreed budget |
| Future integration | You | A separate consumer receives the summary without depending on UI |
| Documentation | Both | Startup, versions, licenses, contracts, method, tests, and limits are consultable |

Performance budget and quantitative criteria for webcam testing must be agreed before final tests. Prototype completion attests observed technical behavior, not clinical validation of the measure.

## 9 First tasks to take on

- [x] **You — T01:** create structure, configuration, and project commands. Completed November 13, 2026; verifications and instructions in `vision-prototype/README.md`.
- [x] **Nervo — N01:** contract, fixture, and expected result proposal in `vision-prototype/src/contracts/`, `vision-prototype/fixtures/`, and `vision-prototype/docs/contracts.md`. Completed November 13, 2026; C01 review concluded on delegation of the application owner.
- [x] **C01:** contracts v2, time policy, and missing data established; webcam aligned to RGBA format. Decisions in `vision-prototype/docs/contracts.md`.
- [x] **You — T02:** interface and synthetic replay implemented and automatically verified.
- [ ] **You — T03:** acquisition implemented; physical webcam testing still to complete.
- [ ] **You — T04:** pipeline and UI connected; first complete physical webcam session still to verify.
- [ ] **You — T05:** export and consumer implemented; manual download test still to complete.
- [ ] **You — T06:** application, offline, and subpath testing still to execute.
- [x] **Nervo — N02:** timing engine, replay, and deterministic tests in `vision-prototype/src/analysis/` and `vision-prototype/tests/analysis/`. Completed November 13, 2026; contracts and fixtures confirmed in C01 v1.
- [x] **Nervo — N03:** EAR geometry, admissibility checks, calibration, normalization, and tests in `vision-prototype/src/analysis/`, `vision-prototype/tests/analysis/`, `vision-prototype/docs/calibration.md`, and `vision-prototype/docs/measurement-method.md`. Completed November 13, 2026; MediaPipe indices and thresholds remain to be verified with N04/N05.
- [x] **Nervo — N04:** MediaPipe adapter, local assets verified, landmark conversion, and structural connection to T03 in `vision-prototype/src/inference/`, `vision-prototype/public/models/`, and `vision-prototype/docs/inference.md`. Completed November 13, 2026; real loading, CPU/GPU, Worker, and performance remain to be verified with T04/N05.
- [ ] **Nervo — N05:** event comparison harness, performance summary, protocol, and synthetic results in `vision-prototype/src/validation/`, `vision-prototype/tests/validation/`, and `vision-prototype/docs/validation-results.md`. Preparation completed November 13, 2026; quantitative validation with webcam and real annotations remains to be executed with T04/T05 already available. The session records latencies and exports reports with context; comparison requires real annotations.

The status distinguishes automatically verified implementation and still-open manual testing.
