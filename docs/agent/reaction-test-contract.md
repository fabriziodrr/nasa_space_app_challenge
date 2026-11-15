# Reaction test prototype contract

The standalone `/reaction-demo` is an experimental three-minute reaction test inspired by the PVT. It is not the validated NASA Reaction Self Test and cannot diagnose fatigue or support clinical decisions. It does not read or write the backend, create an astronaut identity, share data with Houston, or modify the agent workflow.

`ReactionTest` accepts an optional `onComplete(result)` callback. Results are in memory only. `client/reaction-test/contract.ts` defines the versioned `reaction-demo-v1` result and trial schema. The test produces UTC start/end timestamps, elapsed monotonic time, a completed/interrupted status and reason, and raw trials with response time in milliseconds or a false start/missed status. A stimulus offset is relative to test start. Input timing is measured locally using `performance.now()`; display, browser, device and input latency are not calibrated.

The demo waits a random 2–5 seconds between signals, allows 1.5 seconds to respond and treats responses below 100 ms as early. A response at or above 500 ms is counted in the displayed demo summary, consistent with the existing backend demo metric. These are prototype conventions, not PVT-B thresholds. The test is interrupted on user stop, a hidden tab, clock inconsistency, an event-loop delay over one second, or 1,000 recorded events. An interrupted result is not a completed measurement.

## Future backend integration

- Bind the result to an authenticated astronaut/session on the server and obtain explicit sharing authorization before Houston or report access.
- Agree with Emanuel on a new protocol identifier and server validation. The existing backend `VigilanceObservation` expects `aegis-pvt-demo-v1`; do not relabel this new protocol as that existing one without agreement. Its trial shapes are similar but the new prototype also records timing offsets and interruption state.
- Persist raw trials, measurement status, timestamps and protocol parameters; calculate summaries on the server and distinguish real browser results from synthetic profiles.
- Freeze the selected completed result at check-in confirmation, track its provenance and sharing choice, and expose it as an independent evidence source in reports. Never infer a diagnosis or automatically apply schedule changes.
- Compare with a person's baseline only when one is explicitly available and comparable; this prototype has no baseline and makes no claims about fatigue levels.

References: [NASA Reaction Self Test](https://techport.nasa.gov/projects/23201), [NASA PVT-B overview](https://ntrs.nasa.gov/api/citations/20220005715/downloads/AsMA%202022%20-%20Sanders%20-%20NO%20Supplementation%20v4.pdf).
