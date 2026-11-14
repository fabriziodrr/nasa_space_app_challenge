import assert from "node:assert/strict";
import { test } from "node:test";
import { convertValidatedVisionExport } from "../../server/agent/vision/convert-export";
import { DEFAULT_VISION_QUALITY } from "../../server/agent/vision/quality";

const origin = Date.parse("2026-11-14T10:00:00Z");
const data = {
  schemaVersion: "crewready-session-v2", contractVersion: "c01-v2", exportedAt: "2026-11-14T10:01:01Z",
  source: { kind: "webcam" }, timeOriginUnixMs: origin, application: { interruption: "user_stop" },
  snapshot: { engineVersion: "n02-engine-v1", config: { configId: "config" }, calibrationIds: ["cal"],
    session: { startMs: 0, endMs: 60000, elapsedMs: 60000, validMs: 48000, coverage: 0.8, closureFraction: 0,
      closures: { completeCount: 0, incompleteCount: 0, prolongedCount: 0, longestCompleteMs: null } } },
};
const assignment = { id: "v1", astronautId: "astro-1", sessionId: "session-1", sha256: "a".repeat(64),
  importedAt: new Date("2026-11-14T10:02:00Z"), quality: DEFAULT_VISION_QUALITY };

test("conversion uses observed interval, preserves zero and attaches server identity", () => {
  const result = convertValidatedVisionExport(data, assignment);
  assert.equal(result.startedAt, "2026-11-14T10:00:00.000Z");
  assert.equal(result.endedAt, "2026-11-14T10:01:00.000Z");
  assert.equal(result.closureFraction, 0); assert.equal(result.astronautId, "astro-1"); assert.equal(result.usability, "USABLE");
});
test("synthetic time remains absent and unusable; future webcam intervals are rejected", () => {
  const result = convertValidatedVisionExport({ ...data, source: { kind: "synthetic" }, timeOriginUnixMs: null, application: null }, assignment);
  assert.equal(result.startedAt, null); assert.equal(result.usability, "INSUFFICIENT");
  assert.ok(result.reasons.includes("SYNTHETIC_TIME_UNAVAILABLE"));
  assert.throws(() => convertValidatedVisionExport({ ...data, timeOriginUnixMs: origin + 900000 }, assignment), /Intervallo/);
});
