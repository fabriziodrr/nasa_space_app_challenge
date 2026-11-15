import { z } from "zod";
import { IdSchema, TimestampSchema, VersionSchema } from "./common";

// I0 integration contract. Existing v1 session and check-in payloads remain unchanged.
export const VISION_CONTRACT_VERSION = "vision-observation-1" as const;
export const VisionReasonSchema = z.enum([
  "NO_VALID_TIME", "TOO_SHORT", "LOW_COVERAGE", "STALE", "INTERRUPTED", "SYNTHETIC_TIME_UNAVAILABLE",
]);
export const VisionObservationSchema = z.strictObject({
  schemaVersion: z.literal(VISION_CONTRACT_VERSION),
  id: IdSchema,
  astronautId: IdSchema,
  sessionId: IdSchema,
  source: z.enum(["webcam", "synthetic"]),
  exportSchemaVersion: z.literal("crewready-session-v2"),
  exportContractVersion: z.string().min(1).max(64),
  engineVersion: z.string().min(1).max(64),
  configId: z.string().min(1).max(128),
  calibrationIds: z.array(z.string().min(1).max(128)).max(100),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  startedAt: TimestampSchema.nullable(),
  endedAt: TimestampSchema.nullable(),
  exportedAt: TimestampSchema,
  importedAt: TimestampSchema,
  elapsedMs: z.number().finite().nonnegative(),
  validMs: z.number().finite().nonnegative(),
  coverage: z.number().finite().min(0).max(1).nullable(),
  closureFraction: z.number().finite().min(0).max(1).nullable(),
  completeCount: z.number().int().nonnegative(),
  incompleteCount: z.number().int().nonnegative(),
  prolongedCount: z.number().int().nonnegative(),
  longestCompleteMs: z.number().finite().nonnegative().nullable(),
  interruption: z.enum(["user_stop", "source_changed", "page_hidden", "device_lost", "calibration_invalidated", "sample_limit", "processing_error"]).nullable(),
  usability: z.enum(["USABLE", "INSUFFICIENT"]),
  reasons: z.array(VisionReasonSchema).max(6),
}).superRefine((value, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  if ((value.startedAt === null) !== (value.endedAt === null)
      || (value.startedAt && value.endedAt && Date.parse(value.startedAt) > Date.parse(value.endedAt))) issue("Invalid observation interval");
  if (value.source === "webcam" && value.startedAt === null && value.elapsedMs > 0) issue("Webcam interval required");
  if (value.validMs > value.elapsedMs || (value.elapsedMs === 0) !== (value.coverage === null)
      || (value.validMs === 0) !== (value.closureFraction === null)) issue("Inconsistent duration or unavailable metric");
  if (value.prolongedCount > value.completeCount || (value.completeCount === 0) !== (value.longestCompleteMs === null)) issue("Inconsistent closure counts");
  if ((value.usability === "USABLE") !== (value.reasons.length === 0) || new Set(value.reasons).size !== value.reasons.length) issue("Invalid usability reasons");
});

export const VisionEvidenceRefSchema = z.strictObject({ source: z.literal("vision"), visionObservationId: IdSchema });
export const VisionSelectionSchema = z.strictObject({ visionObservationId: IdSchema.nullable(), shareWithGround: z.boolean() })
  .refine((value) => value.visionObservationId !== null || !value.shareWithGround, "A shared selection requires an observation");
export const ConfirmCheckInWithVisionRequestSchema = z.strictObject({
  expectedRevision: VersionSchema,
  sharedObservationIds: z.array(IdSchema).max(6).refine((ids) => new Set(ids).size === ids.length),
  vision: VisionSelectionSchema,
});
export type VisionObservation = z.infer<typeof VisionObservationSchema>;
export type VisionSelection = z.infer<typeof VisionSelectionSchema>;
