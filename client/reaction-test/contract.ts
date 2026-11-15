import { z } from "zod";

// The prototype is inspired by a PVT; this is not the validated NASA protocol.
export const REACTION_PROTOCOL = "reaction-demo-v1" as const;
export const REACTION_DURATION_MS = 180_000;
export const DEMO_LAPSE_MS = 500;
export const ReactionTrialSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("response"), rt_ms: z.number().min(100).max(1500), stimulus_offset_ms: z.number().min(0) }),
  z.strictObject({ status: z.literal("false_start"), rt_ms: z.null(), stimulus_offset_ms: z.number().min(0).nullable() }),
  z.strictObject({ status: z.literal("missed"), rt_ms: z.null(), stimulus_offset_ms: z.number().min(0) }),
]);
export const ReactionResultSchema = z.strictObject({
  schema_version: z.literal("1"), protocol_id: z.literal(REACTION_PROTOCOL),
  started_at: z.iso.datetime(), ended_at: z.iso.datetime(), elapsed_ms: z.number().min(0),
  status: z.enum(["completed", "interrupted"]),
  interruption: z.enum(["user", "hidden", "clock_changed", "timing_unreliable", "input_limit"]).nullable(),
  trials: z.array(ReactionTrialSchema).max(1000),
}).refine((result) => (result.status === "completed") === (result.interruption === null), "Interruption must match status");
export type ReactionTrial = z.infer<typeof ReactionTrialSchema>;
export type ReactionResult = z.infer<typeof ReactionResultSchema>;

export function summarizeReaction(trials: ReactionTrial[]) {
  const values = trials.flatMap((trial) => trial.status === "response" ? [trial.rt_ms] : []).sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  return { response_count: values.length, median_rt_ms: values.length ? values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2 : null,
    false_start_count: trials.filter((trial) => trial.status === "false_start").length,
    missed_count: trials.filter((trial) => trial.status === "missed").length,
    lapse_count: values.filter((value) => value >= DEMO_LAPSE_MS).length };
}
