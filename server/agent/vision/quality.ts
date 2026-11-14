import type { VisionObservation } from "../contracts";

export interface VisionQualityConfig { minValidMs: number; minCoverage: number; maxAgeMinutes: number }
export const DEFAULT_VISION_QUALITY: VisionQualityConfig = { minValidMs: 30_000, minCoverage: 0.7, maxAgeMinutes: 120 };

/** Evaluate at the requested instant; never promote a previously insufficient result. */
export function evaluateVisionQuality(
  observation: VisionObservation,
  at: Date,
  config: VisionQualityConfig = DEFAULT_VISION_QUALITY,
): Pick<VisionObservation, "usability" | "reasons"> {
  const reasons = new Set(observation.reasons);
  if (observation.source === "synthetic") reasons.add("SYNTHETIC_TIME_UNAVAILABLE");
  if (!observation.validMs) reasons.add("NO_VALID_TIME");
  if (observation.validMs < config.minValidMs) reasons.add("TOO_SHORT");
  if (observation.coverage === null || observation.coverage < config.minCoverage) reasons.add("LOW_COVERAGE");
  if (observation.endedAt && at.getTime() - Date.parse(observation.endedAt) > config.maxAgeMinutes * 60_000) reasons.add("STALE");
  if (observation.interruption && observation.interruption !== "user_stop") reasons.add("INTERRUPTED");
  return { usability: reasons.size ? "INSUFFICIENT" : "USABLE", reasons: [...reasons] };
}
