import { z } from "zod";
import { IdSchema } from "./common";
import { ScheduleSnapshotSchema } from "./context";
import { ScheduleProposalSchema } from "./scheduling";
import { DecisionResultSchema } from "./api";

/** Browser-safe public responses for the planning APIs, including vision evidence. */
export const successV2Schema = <T extends z.ZodType>(data: T) => z.strictObject({
  data, meta: z.strictObject({ contractVersion: z.literal("2.0.0"), requestId: IdSchema }),
});
export const ScheduleQuerySchema = z.strictObject({ astronautId: IdSchema, date: z.iso.date() });
export const ProposalListV2ResponseSchema = successV2Schema(z.strictObject({
  items: z.array(ScheduleProposalSchema).max(100), nextCursor: IdSchema.nullable(),
}));
export const DecisionV2ResponseSchema = successV2Schema(DecisionResultSchema);
export const ScheduleV2ResponseSchema = successV2Schema(ScheduleSnapshotSchema);
export type ProposalListV2Response = z.infer<typeof ProposalListV2ResponseSchema>;
export type DecisionV2Response = z.infer<typeof DecisionV2ResponseSchema>;
export type ScheduleV2Response = z.infer<typeof ScheduleV2ResponseSchema>;
