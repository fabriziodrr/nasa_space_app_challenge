import { z } from "zod";
import {
  IdSchema, ScenarioSchema, TextSchema, TimestampSchema, TimeZoneSchema, VersionSchema,
} from "./common";

const sensorBase = {
  id: IdSchema,
  astronautId: IdSchema,
  observedAt: TimestampSchema,
  source: z.literal("sensor"),
  simulated: z.literal(true),
  scenario: ScenarioSchema,
  quality: z.enum(["GOOD", "DEGRADED", "UNAVAILABLE"]),
};
export const SensorReadingSchema = z.discriminatedUnion("metric", [
  z.strictObject({ ...sensorBase, metric: z.literal("SLEEP_DURATION"),
    value: z.number().min(0).max(24).nullable(), unit: z.literal("h") }),
  z.strictObject({ ...sensorBase, metric: z.literal("SLEEP_INTERRUPTION_COUNT"),
    value: z.number().int().min(0).max(500).nullable(), unit: z.literal("count") }),
  z.strictObject({ ...sensorBase, metric: z.literal("RESTING_HEART_RATE"),
    value: z.number().positive().max(300).nullable(), unit: z.literal("bpm") }),
]).refine((reading) => (reading.quality === "UNAVAILABLE") === (reading.value === null), {
  message: "Only unavailable readings have a null value", path: ["value"],
});

export const ScheduleActivitySchema = z.strictObject({
  id: IdSchema,
  title: z.string().trim().min(1).max(200),
  kind: z.enum(["MISSION", "EXERCISE", "MEAL", "REST", "PERSONAL"]),
  startsAt: TimestampSchema,
  endsAt: TimestampSchema,
  priority: z.enum(["CRITICAL", "NORMAL", "LOW"]),
  movable: z.boolean(),
  dependsOn: z.array(IdSchema).max(100),
  earliestStart: TimestampSchema,
  latestEnd: TimestampSchema,
}).refine((activity) =>
  Date.parse(activity.startsAt) < Date.parse(activity.endsAt)
  && Date.parse(activity.earliestStart) <= Date.parse(activity.startsAt)
  && Date.parse(activity.endsAt) <= Date.parse(activity.latestEnd),
{ message: "Activity must have positive duration within its allowed window" });

export const ScheduleSnapshotSchema = z.strictObject({
  id: IdSchema,
  astronautId: IdSchema,
  date: z.iso.date(),
  timeZone: TimeZoneSchema,
  version: VersionSchema,
  dayStartsAt: TimestampSchema,
  dayEndsAt: TimestampSchema,
  activities: z.array(ScheduleActivitySchema).max(200),
}).refine((schedule) => Date.parse(schedule.dayStartsAt) < Date.parse(schedule.dayEndsAt), {
  message: "Invalid schedule day interval",
}).refine((schedule) => new Set(schedule.activities.map((a) => a.id)).size === schedule.activities.length, {
  message: "Activity IDs must be unique", path: ["activities"],
});

export const EvidenceRefSchema = z.discriminatedUnion("source", [
  z.strictObject({ source: z.literal("sensor"), sensorReadingId: IdSchema }),
  z.strictObject({ source: z.literal("self_report"), observationId: IdSchema }),
]);
export const FindingSchema = z.strictObject({
  text: TextSchema,
  source: z.enum(["sensor", "self_report", "inference"]),
  evidence: z.array(EvidenceRefSchema).min(1).max(50),
}).refine((finding) => finding.source === "inference"
  || finding.evidence.every((ref) => ref.source === finding.source), {
  message: "Measured/reported findings must cite matching sources; mixed deductions are inference",
});

export type SensorReading = z.infer<typeof SensorReadingSchema>;
export type ScheduleActivity = z.infer<typeof ScheduleActivitySchema>;
export type ScheduleSnapshot = z.infer<typeof ScheduleSnapshotSchema>;
export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;
export type Finding = z.infer<typeof FindingSchema>;
