import { z } from "zod";
import { CONTRACT_VERSION, IdSchema, TextSchema, TimestampSchema, VersionSchema } from "./common";
import {
  CheckInSchema, ConversationMessageSchema, ConversationSessionSchema, DiaryEntrySchema,
  GroundReportSchema, ObservationsSchema,
} from "./conversation";
import { ScheduleSnapshotSchema } from "./context";
import { ProposalDecisionSchema, ScheduleProposalSchema } from "./scheduling";

export const API_BASE_PATH = "/api/agent/v1" as const;
export const ApiMetaSchema = z.strictObject({
  contractVersion: z.literal(CONTRACT_VERSION), requestId: IdSchema,
});
export const successSchema = <T extends z.ZodType>(data: T) => z.strictObject({ data, meta: ApiMetaSchema });
export const EmptyRequestSchema = z.strictObject({});
export const CreateSessionRequestSchema = z.strictObject({ astronautId: IdSchema });
export const SendMessageRequestSchema = z.strictObject({
  clientMessageId: IdSchema,
  text: TextSchema,
  inputMode: z.enum(["TEXT", "VOICE"]),
});
export const UpdateCheckInRequestSchema = z.strictObject({
  expectedRevision: VersionSchema,
  observations: ObservationsSchema,
});
export const ConfirmCheckInRequestSchema = z.strictObject({
  expectedRevision: VersionSchema,
  sharedObservationIds: z.array(IdSchema).max(4)
    .refine((ids) => new Set(ids).size === ids.length, "Duplicate observation IDs"),
});
export const DecideProposalRequestSchema = z.strictObject({
  decision: z.enum(["APPROVE", "REJECT"]),
  comment: TextSchema.nullable(),
});
export const IdempotencyHeadersSchema = z.strictObject({ "idempotency-key": IdSchema });
export const UpdateDiaryRequestSchema = z.strictObject({
  expectedRevision: VersionSchema,
  text: TextSchema,
  status: z.enum(["DRAFT", "CONFIRMED"]),
});
export const ListQuerySchema = z.strictObject({
  astronautId: IdSchema,
  cursor: IdSchema.optional(),
  limit: z.number().int().min(1).max(100).default(20),
});
export const GenerationStatusSchema = z.enum(["NOT_STARTED", "PROCESSING", "READY", "FAILED"]);
export const SessionStateSchema = z.strictObject({
  session: ConversationSessionSchema,
  messages: z.array(ConversationMessageSchema).max(200),
  nextMessageCursor: IdSchema.nullable(),
  checkIn: CheckInSchema.nullable(),
  generationStatus: GenerationStatusSchema,
  reportId: IdSchema.nullable(),
  diaryEntryId: IdSchema.nullable(),
  proposal: ScheduleProposalSchema.nullable(),
  noChangeReason: TextSchema.nullable(),
}).superRefine((state, ctx) => {
  if (state.generationStatus === "READY"
      && (state.reportId === null || state.diaryEntryId === null
        || ((state.proposal === null) !== (state.noChangeReason !== null)))) {
    ctx.addIssue({ code: "custom", message: "READY requires artifacts and either proposal or no-change reason" });
  }
  if (state.messages.some((m) => m.sessionId !== state.session.id)
      || (state.checkIn !== null && (state.checkIn.sessionId !== state.session.id
        || state.checkIn.astronautId !== state.session.astronautId))
      || (state.proposal !== null && (state.proposal.checkInId !== state.checkIn?.id
        || state.proposal.astronautId !== state.session.astronautId))) {
    ctx.addIssue({ code: "custom", message: "Session artifacts must belong to this session and astronaut" });
  }
});
export const MessageResultSchema = z.strictObject({
  astronautMessage: ConversationMessageSchema,
  assistantMessage: ConversationMessageSchema,
  checkIn: CheckInSchema,
});
export const DecisionResultSchema = z.strictObject({
  decision: ProposalDecisionSchema.nullable(),
  proposal: ScheduleProposalSchema,
  schedule: ScheduleSnapshotSchema.nullable(),
}).superRefine((result, ctx) => {
  const { proposal, decision, schedule } = result;
  if (proposal.decisionId !== (decision?.id ?? null)
      || (decision !== null && (decision.proposalId !== proposal.id
        || (proposal.status === "REJECTED" ? decision.decision !== "REJECT" : decision.decision !== "APPROVE")))
      || ((proposal.status === "APPLIED") !== (schedule !== null))
      || (schedule !== null && (schedule.id !== proposal.scheduleId
        || schedule.astronautId !== proposal.astronautId
        || schedule.version !== proposal.appliedScheduleVersion))) {
    ctx.addIssue({ code: "custom", message: "Decision, application metadata and schedule must agree" });
  }
});

export const AUDIO_LIMITS = {
  maxBytes: 10 * 1024 * 1024,
  maxDurationSeconds: 120,
  providerTimeoutMs: 30_000,
  language: "it",
} as const;
export const AudioMimeTypeSchema = z.enum([
  "audio/webm", "audio/webm;codecs=opus", "audio/mp4", "audio/wav", "audio/mpeg",
]);
export const TranscriptionMetadataSchema = z.strictObject({
  sessionId: IdSchema,
  mimeType: AudioMimeTypeSchema,
  sizeBytes: z.number().int().positive().max(AUDIO_LIMITS.maxBytes),
  durationSeconds: z.number().positive().max(AUDIO_LIMITS.maxDurationSeconds),
});
export const TranscriptionResultSchema = z.strictObject({ text: TextSchema, language: z.literal("it") });
export const SpeechRequestSchema = z.strictObject({ sessionId: IdSchema, messageId: IdSchema });

export const CreateSessionResponseSchema = successSchema(ConversationSessionSchema);
export const SessionResponseSchema = successSchema(SessionStateSchema);
export const MessageResponseSchema = successSchema(MessageResultSchema);
export const CheckInResponseSchema = successSchema(CheckInSchema);
export const ConfirmCheckInResponseSchema = successSchema(SessionStateSchema);
export const DecisionResponseSchema = successSchema(DecisionResultSchema);
export const DiaryResponseSchema = successSchema(DiaryEntrySchema);
export const TranscriptionResponseSchema = successSchema(TranscriptionResultSchema);
const pageSchema = <T extends z.ZodType>(item: T) => successSchema(z.strictObject({
  items: z.array(item).max(100), nextCursor: IdSchema.nullable(),
}));
export const ProposalListResponseSchema = pageSchema(ScheduleProposalSchema);
export const ReportListResponseSchema = pageSchema(GroundReportSchema);
export const DiaryListResponseSchema = pageSchema(DiaryEntrySchema);

// Parsed query values: HTTP adapters must explicitly convert query.limit to a number.
export const SessionQuerySchema = z.strictObject({ beforeMessageId: IdSchema.optional() });
export const SensorWindowSchema = z.strictObject({
  from: TimestampSchema, to: TimestampSchema,
}).refine((window) => Date.parse(window.from) < Date.parse(window.to), "Invalid sensor window");

export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;
export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;
export type UpdateCheckInRequest = z.infer<typeof UpdateCheckInRequestSchema>;
export type ConfirmCheckInRequest = z.infer<typeof ConfirmCheckInRequestSchema>;
export type DecideProposalRequest = z.infer<typeof DecideProposalRequestSchema>;
export type UpdateDiaryRequest = z.infer<typeof UpdateDiaryRequestSchema>;
export type ListQuery = z.infer<typeof ListQuerySchema>;
export type SessionState = z.infer<typeof SessionStateSchema>;
export type MessageResult = z.infer<typeof MessageResultSchema>;
export type DecisionResult = z.infer<typeof DecisionResultSchema>;
export type AudioMimeType = z.infer<typeof AudioMimeTypeSchema>;
export type TranscriptionMetadata = z.infer<typeof TranscriptionMetadataSchema>;
export type SensorWindow = z.infer<typeof SensorWindowSchema>;
export type CreateSessionResponse = z.infer<typeof CreateSessionResponseSchema>;
export type SessionResponse = z.infer<typeof SessionResponseSchema>;
export type MessageResponse = z.infer<typeof MessageResponseSchema>;
export type CheckInResponse = z.infer<typeof CheckInResponseSchema>;
export type ConfirmCheckInResponse = z.infer<typeof ConfirmCheckInResponseSchema>;
export type DecisionResponse = z.infer<typeof DecisionResponseSchema>;
export type DiaryResponse = z.infer<typeof DiaryResponseSchema>;
export type TranscriptionResponse = z.infer<typeof TranscriptionResponseSchema>;
export type ProposalListResponse = z.infer<typeof ProposalListResponseSchema>;
export type ReportListResponse = z.infer<typeof ReportListResponseSchema>;
export type DiaryListResponse = z.infer<typeof DiaryListResponseSchema>;
