import assert from "node:assert/strict";
import { test } from "node:test";
import { ConfirmCheckInWithVisionRequestSchema, VisionObservationSchema } from "../../server/agent/contracts/vision";

const usable = {
  schemaVersion: "vision-observation-1", id: "vision-1", astronautId: "astro-1", sessionId: "session-1",
  source: "webcam", exportSchemaVersion: "crewready-session-v2", exportContractVersion: "c01-v2",
  engineVersion: "n02-engine-v1", configId: "config-1", calibrationIds: ["cal-1"], sha256: "a".repeat(64),
  startedAt: "2026-11-14T09:00:00Z", endedAt: "2026-11-14T09:01:00Z", exportedAt: "2026-11-14T09:01:05Z",
  importedAt: "2026-11-14T09:01:10Z", elapsedMs: 60000, validMs: 54000, coverage: 0.9,
  closureFraction: 0, completeCount: 0, incompleteCount: 0, prolongedCount: 0, longestCompleteMs: null,
  interruption: "user_stop", usability: "USABLE", reasons: [],
};
test("vision contract preserves zero and absent measurements separately", () => {
  assert.equal(VisionObservationSchema.parse(usable).closureFraction, 0);
  const insufficient = { ...usable, validMs: 0, coverage: 0, closureFraction: null, usability: "INSUFFICIENT", reasons: ["NO_VALID_TIME"] };
  assert.equal(VisionObservationSchema.parse(insufficient).closureFraction, null);
  assert.equal(VisionObservationSchema.safeParse({ ...insufficient, closureFraction: 0 }).success, false);
});
test("synthetic measurements can retain virtual time without claiming a real interval", () => {
  const synthetic = { ...usable, source: "synthetic", startedAt: null, endedAt: null, usability: "INSUFFICIENT", reasons: ["SYNTHETIC_TIME_UNAVAILABLE"] };
  assert.equal(VisionObservationSchema.safeParse(synthetic).success, true);
  assert.equal(VisionObservationSchema.safeParse({ ...usable, startedAt: null, endedAt: null }).success, false);
});
test("sharing requires a selection and invalid closure counts are rejected", () => {
  const request = { expectedRevision: 1, sharedObservationIds: [], vision: { visionObservationId: null, shareWithGround: true } };
  assert.equal(ConfirmCheckInWithVisionRequestSchema.safeParse(request).success, false);
  assert.equal(ConfirmCheckInWithVisionRequestSchema.safeParse({ ...request, vision: { visionObservationId: "vision-1", shareWithGround: true } }).success, true);
  assert.equal(VisionObservationSchema.safeParse({ ...usable, prolongedCount: 1 }).success, false);
});
