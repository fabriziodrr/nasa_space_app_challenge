import { z } from "zod";
import { IdSchema, TextSchema, TimestampSchema, VersionSchema } from "./common";
import { FindingSchema, SensorReadingSchema } from "./context";
import { VisionObservationSchema } from "./vision";

export const ConversationSessionSchema = z.strictObject({
  id: IdSchema,
  astronautId: IdSchema,
  openedAt: TimestampSchema,
  closedAt: TimestampSchema.nullable(),
});
export const ConversationMessageSchema = z.strictObject({
  id: IdSchema,
  sessionId: IdSchema,
  role: z.enum(["ASTRONAUT", "ASSISTANT"]),
  text: TextSchema,
  createdAt: TimestampSchema,
  inputMode: z.enum(["TEXT", "VOICE"]),
});

export const ObservationFieldSchema = z.enum([
  "SLEEP_HOURS", "SLEEP_QUALITY", "FATIGUE", "PHYSICAL_NOTES",
]);
const observationBase = {
  id: IdSchema,
  source: z.literal("self_report"),
  messageIds: z.array(IdSchema).min(1).max(50),
  recordedAt: TimestampSchema,
};
export const ObservationSchema = z.discriminatedUnion("field", [
  z.strictObject({ ...observationBase, field: z.literal("SLEEP_HOURS"), value: z.number().min(0).max(24) }),
  z.strictObject({ ...observationBase, field: z.literal("SLEEP_QUALITY"), value: z.number().int().min(1).max(5) }),
  z.strictObject({ ...observationBase, field: z.literal("FATIGUE"), value: z.number().int().min(1).max(5) }),
  z.strictObject({ ...observationBase, field: z.literal("PHYSICAL_NOTES"), value: TextSchema }),
]);
export const ObservationsSchema = z.array(ObservationSchema).max(4).refine((items) =>
  new Set(items.map((item) => item.id)).size === items.length
  && new Set(items.map((item) => item.field)).size === items.length,
{ message: "Observation IDs and fields must be unique" });

export const CheckInSchema = z.strictObject({
  id: IdSchema,
  astronautId: IdSchema,
  sessionId: IdSchema,
  revision: VersionSchema,
  status: z.enum(["DRAFT", "CONFIRMED"]),
  observations: ObservationsSchema,
  sharedObservationIds: z.array(IdSchema).max(4),
  createdAt: TimestampSchema,
  confirmedAt: TimestampSchema.nullable(),
}).refine((checkIn) => (checkIn.status === "CONFIRMED") === (checkIn.confirmedAt !== null), {
  message: "Only confirmed check-ins have confirmedAt", path: ["confirmedAt"],
}).refine((checkIn) =>
  new Set(checkIn.sharedObservationIds).size === checkIn.sharedObservationIds.length
  && checkIn.sharedObservationIds.every((id) => checkIn.observations.some((o) => o.id === id)),
{ message: "Sharing must reference distinct observations in this check-in", path: ["sharedObservationIds"] });

// This projection is the ONLY check-in input for operational report/proposal generation.
// Message IDs and private observations must be removed by the application service.
export const SharedObservationSchema = z.discriminatedUnion("field", [
  ObservationSchema.options[0].omit({ messageIds: true }),
  ObservationSchema.options[1].omit({ messageIds: true }),
  ObservationSchema.options[2].omit({ messageIds: true }),
  ObservationSchema.options[3].omit({ messageIds: true }),
]);
export const SharedCheckInSchema = z.strictObject({
  id: IdSchema,
  astronautId: IdSchema,
  confirmedAt: TimestampSchema,
  observations: z.array(SharedObservationSchema).max(4),
}).refine((checkIn) =>
  new Set(checkIn.observations.map((o) => o.id)).size === checkIn.observations.length
  && new Set(checkIn.observations.map((o) => o.field)).size === checkIn.observations.length,
{ message: "Shared observation IDs and fields must be unique" });

export const GroundReportSchema = z.strictObject({
  id: IdSchema,
  astronautId: IdSchema,
  checkInId: IdSchema,
  generatedAt: TimestampSchema,
  findings: z.array(FindingSchema).max(30),
  discrepancies: z.array(FindingSchema).max(20),
  uncertainties: z.array(TextSchema).max(20),
  humanReview: z.strictObject({ required: z.boolean(), reason: TextSchema.nullable() })
    .refine((review) => review.required === (review.reason !== null), "Review reason must match required flag"),
  proposalId: IdSchema.nullable(),
});
export const DiaryEntrySchema = z.strictObject({
  id: IdSchema,
  astronautId: IdSchema,
  checkInId: IdSchema,
  date: z.iso.date(),
  text: TextSchema,
  revision: VersionSchema,
  status: z.enum(["DRAFT", "CONFIRMED"]),
  visibility: z.literal("PRIVATE"),
  updatedAt: TimestampSchema,
});
export const OperationalContextSchema = z.strictObject({
  checkIn: SharedCheckInSchema,
  sensors: z.array(SensorReadingSchema).max(500),
  vision: z.strictObject({
    id: VisionObservationSchema.shape.id, source: VisionObservationSchema.shape.source,
    startedAt: VisionObservationSchema.shape.startedAt, endedAt: VisionObservationSchema.shape.endedAt,
    elapsedMs: VisionObservationSchema.shape.elapsedMs, validMs: VisionObservationSchema.shape.validMs,
    coverage: VisionObservationSchema.shape.coverage, closureFraction: VisionObservationSchema.shape.closureFraction,
    completeCount: VisionObservationSchema.shape.completeCount, incompleteCount: VisionObservationSchema.shape.incompleteCount,
    prolongedCount: VisionObservationSchema.shape.prolongedCount, longestCompleteMs: VisionObservationSchema.shape.longestCompleteMs,
    interruption: VisionObservationSchema.shape.interruption, usability: VisionObservationSchema.shape.usability,
    reasons: VisionObservationSchema.shape.reasons,
  }).nullable().optional(),
});

export type ConversationSession = z.infer<typeof ConversationSessionSchema>;
export type ConversationMessage = z.infer<typeof ConversationMessageSchema>;
export type Observation = z.infer<typeof ObservationSchema>;
export type CheckIn = z.infer<typeof CheckInSchema>;
export type SharedCheckIn = z.infer<typeof SharedCheckInSchema>;
export type GroundReport = z.infer<typeof GroundReportSchema>;
export type DiaryEntry = z.infer<typeof DiaryEntrySchema>;
export type OperationalContext = z.infer<typeof OperationalContextSchema>;
