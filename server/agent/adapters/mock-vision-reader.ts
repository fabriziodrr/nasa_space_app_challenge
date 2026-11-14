import type { Scenario, VisionObservation } from "../contracts";
import type { VisionObservationReader } from "../ports";

/** Explicitly simulated fixture: never represented as a real webcam capture. */
export class MockVisionReader implements VisionObservationReader {
  constructor(private readonly scenario: Scenario, private readonly now: () => Date = () => new Date()) {}
  async getSelectedForSession(astronautId: string, sessionId: string): Promise<VisionObservation> {
    const prolonged = this.scenario === "RESTED" ? 0 : 2;
    return {
      schemaVersion: "vision-observation-1", id: `vision-${sessionId}`.slice(0, 128), astronautId, sessionId,
      source: "synthetic", exportSchemaVersion: "crewready-session-v2", exportContractVersion: "c01-v2",
      engineVersion: "n02-engine-v1", configId: "demo-config", calibrationIds: ["demo-calibration"],
      sha256: "0".repeat(64), startedAt: null, endedAt: null,
      exportedAt: this.now().toISOString(), importedAt: this.now().toISOString(),
      elapsedMs: 60_000, validMs: 48_000, coverage: 0.8,
      closureFraction: prolonged ? 0.15 : 0.03, completeCount: 4, incompleteCount: 0,
      prolongedCount: prolonged, longestCompleteMs: prolonged ? 1200 : 280,
      interruption: null, usability: "INSUFFICIENT", reasons: ["SYNTHETIC_TIME_UNAVAILABLE"],
    };
  }
}

/** Default until the selected observation is provided by I1. */
export class EmptyVisionReader implements VisionObservationReader {
  async getSelectedForSession(): Promise<null> { return null; }
}
