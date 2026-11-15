import { z } from "zod";
import { TextSchema } from "./common";
import { GroundReportSchema, ObservationsSchema } from "./conversation";
import { ProposalCandidateSchema } from "./scheduling";

export const ConversationOutputSchema = z.strictObject({
  reply: TextSchema,
  observations: ObservationsSchema,
  missingFields: z.array(z.enum(["SLEEP_HOURS", "SLEEP_QUALITY", "FATIGUE", "PHYSICAL_NOTES", "MENTAL_STATE", "STRESSOR_NOTES"])).max(6),
});
export const ReportContentSchema = GroundReportSchema.omit({
  id: true, astronautId: true, checkInId: true, generatedAt: true, proposalId: true,
});
export const OperationalOutputSchema = z.strictObject({
  report: ReportContentSchema,
  proposal: ProposalCandidateSchema.nullable(),
  noChangeReason: TextSchema.nullable(),
}).refine((output) => (output.proposal === null) === (output.noChangeReason !== null), {
  message: "A proposal or an explicit no-change reason is required, never both",
});
export const DiaryOutputSchema = z.strictObject({ text: TextSchema });

export type ConversationOutput = z.infer<typeof ConversationOutputSchema>;
export type OperationalOutput = z.infer<typeof OperationalOutputSchema>;
export type DiaryOutput = z.infer<typeof DiaryOutputSchema>;
