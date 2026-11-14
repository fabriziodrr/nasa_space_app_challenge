import { z } from "zod";
import { IdSchema, TextSchema, TimestampSchema, VersionSchema } from "./common";
import { EvidenceRefSchema, ScheduleSnapshotSchema } from "./context";

export const ScheduleChangeSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("MOVE_ACTIVITY"),
    activityId: IdSchema,
    startsAt: TimestampSchema,
    endsAt: TimestampSchema,
  }),
  z.strictObject({
    type: z.literal("ADD_REST"),
    activityId: IdSchema,
    title: z.string().trim().min(1).max(200),
    startsAt: TimestampSchema,
    endsAt: TimestampSchema,
  }),
]).refine((change) => Date.parse(change.startsAt) < Date.parse(change.endsAt), {
  message: "Change must have positive duration",
});
export const ProposalCandidateSchema = z.strictObject({
  rationale: TextSchema,
  evidence: z.array(EvidenceRefSchema).min(1).max(50),
  changes: z.array(ScheduleChangeSchema).min(1).max(20),
}).refine((candidate) => new Set(candidate.changes.map((c) => c.activityId)).size === candidate.changes.length, {
  message: "Only one operation per activity is allowed", path: ["changes"],
});
export const ProposalStatusSchema = z.enum([
  "PENDING_REVIEW", "APPROVED", "REJECTED", "APPLIED", "STALE", "APPLY_FAILED",
]);
export const ScheduleProposalSchema = z.strictObject({
  id: IdSchema,
  astronautId: IdSchema,
  checkInId: IdSchema,
  scheduleId: IdSchema,
  baseScheduleVersion: VersionSchema,
  createdAt: TimestampSchema,
  candidate: ProposalCandidateSchema,
  status: ProposalStatusSchema,
  decisionId: IdSchema.nullable(),
  appliedScheduleVersion: VersionSchema.nullable(),
  appliedAt: TimestampSchema.nullable(),
}).superRefine((proposal, ctx) => {
  const applied = proposal.status === "APPLIED";
  if (applied !== (proposal.appliedAt !== null)
      || applied !== (proposal.appliedScheduleVersion !== null)
      || (proposal.appliedScheduleVersion !== null
        && proposal.appliedScheduleVersion <= proposal.baseScheduleVersion)) {
    ctx.addIssue({ code: "custom", message: "Applied metadata must match status and advance the schedule version" });
  }
  if ((proposal.status === "PENDING_REVIEW" && proposal.decisionId !== null)
      || (["APPROVED", "REJECTED", "APPLIED", "APPLY_FAILED"].includes(proposal.status)
        && proposal.decisionId === null)) {
    ctx.addIssue({ code: "custom", message: "Decision ID is inconsistent with proposal status" });
  }
});
export const ProposalDecisionSchema = z.strictObject({
  id: IdSchema,
  proposalId: IdSchema,
  operatorId: IdSchema,
  decision: z.enum(["APPROVE", "REJECT"]),
  comment: TextSchema.nullable(),
  decidedAt: TimestampSchema,
  idempotencyKey: IdSchema,
});

export const ScheduleValidationResultSchema = z.discriminatedUnion("valid", [
  z.strictObject({ valid: z.literal(true), preview: ScheduleSnapshotSchema }),
  z.strictObject({ valid: z.literal(false), violations: z.array(z.strictObject({
    code: z.enum([
      "UNKNOWN_ACTIVITY", "LOCKED_ACTIVITY", "DURATION_CHANGED", "OVERLAP",
      "DEPENDENCY_VIOLATION", "OUTSIDE_WINDOW", "OUTSIDE_DAY", "DUPLICATE_ACTIVITY",
      "VERSION_CONFLICT", "UNSHARED_EVIDENCE",
    ]),
    activityId: IdSchema.nullable(),
    message: TextSchema,
  })).min(1).max(100) }),
]);
export const ScheduleApplyCommandSchema = z.strictObject({
  astronautId: IdSchema,
  scheduleId: IdSchema,
  proposalId: IdSchema,
  decisionId: IdSchema,
  expectedScheduleVersion: VersionSchema,
  changes: z.array(ScheduleChangeSchema).min(1).max(20),
});
// UNKNOWN is essential: a timeout does not prove that the external write failed.
export const ScheduleApplyResultSchema = z.discriminatedUnion("outcome", [
  z.strictObject({ outcome: z.literal("APPLIED"), schedule: ScheduleSnapshotSchema, appliedAt: TimestampSchema }),
  z.strictObject({ outcome: z.literal("STALE"), currentVersion: VersionSchema }),
  z.strictObject({ outcome: z.literal("FAILED"), retryable: z.boolean(), reason: TextSchema }),
  z.strictObject({ outcome: z.literal("UNKNOWN") }),
]);

export type ScheduleChange = z.infer<typeof ScheduleChangeSchema>;
export type ProposalCandidate = z.infer<typeof ProposalCandidateSchema>;
export type ProposalStatus = z.infer<typeof ProposalStatusSchema>;
export type ScheduleProposal = z.infer<typeof ScheduleProposalSchema>;
export type ProposalDecision = z.infer<typeof ProposalDecisionSchema>;
export type ScheduleValidationResult = z.infer<typeof ScheduleValidationResultSchema>;
export type ScheduleApplyCommand = z.infer<typeof ScheduleApplyCommandSchema>;
export type ScheduleApplyResult = z.infer<typeof ScheduleApplyResultSchema>;
