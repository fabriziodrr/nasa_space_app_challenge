// Server-side extension points. Implementations belong in adapters/, not contracts/.
import type {
  AudioMimeType, CheckIn, ConfirmCheckInRequest,
  ConversationMessage, ConversationOutput, ConversationSession, DecideProposalRequest,
  DiaryEntry, DiaryOutput, GroundReport, Identity, ListQuery, MessageResult,
  OperationalContext, OperationalOutput, ProposalCandidate, ProposalDecision,
  ScheduleApplyCommand, ScheduleApplyResult, ScheduleProposal, ScheduleSnapshot,
  ScheduleValidationResult, SendMessageRequest, SensorReading, SensorWindow,
  SessionState, TranscriptionMetadata, UpdateCheckInRequest, UpdateDiaryRequest,
} from "./contracts";
import type { VisionObservation } from "./contracts/vision";

export interface ProviderOptions { signal?: AbortSignal }

/** Summary of a vision observation for the conversation context. */
export interface VisionSummary {
  id: string;
  source: VisionObservation["source"];
  usability: VisionObservation["usability"];
  reasons: VisionObservation["reasons"];
  elapsedMs: number;
  validMs: number;
  coverage: number | null;
  closureFraction: number | null;
  completeCount: number;
  incompleteCount: number;
  prolongedCount: number;
  longestCompleteMs: number | null;
  interruption: VisionObservation["interruption"];
  startedAt: string | null;
  endedAt: string | null;
  importedAt: string;
}

export interface ConversationContext {
  astronautId: string;
  messages: ConversationMessage[];
  draft: CheckIn | null;
  previousCheckIns: CheckIn[];
  sensors: SensorReading[];
  schedule: ScheduleSnapshot;
  /** Vision observations available for this session; may be empty. */
  visionObservations: VisionSummary[];
}
export interface ConversationAiProvider {
  // Private context allowed. Output is untrusted until schema AND reference checks pass.
  converse(input: ConversationContext, options?: ProviderOptions): Promise<ConversationOutput>;
}
export interface OperationalAiProvider {
  // Never receives full transcripts, private diary or unshared observations.
  generateOperational(
    input: { context: OperationalContext; schedule: ScheduleSnapshot; proposalFeedback?: string[] },
    options?: ProviderOptions,
  ): Promise<OperationalOutput>;
}
export interface DiaryAiProvider {
  generateDiary(
    input: { astronautId: string; messages: ConversationMessage[]; checkIn: CheckIn },
    options?: ProviderOptions,
  ): Promise<DiaryOutput>;
}
export interface AiProvider extends ConversationAiProvider, OperationalAiProvider, DiaryAiProvider {}
export interface VoiceProvider {
  transcribe(
    input: { audio: Uint8Array; metadata: TranscriptionMetadata },
    options?: ProviderOptions,
  ): Promise<{ text: string; language: "en" }>;
  synthesize(
    input: { text: string; language: "en" }, options?: ProviderOptions,
  ): Promise<{ audio: Uint8Array; mimeType: AudioMimeType }>;
}
export interface SensorProvider {
  read(astronautId: string, window: SensorWindow): Promise<SensorReading[]>;
}
/** Read-only access to vision observations for a session. I2 uses a mock; I1 provides the real adapter. */
export interface VisionObservationReader {
  getSelectedForSession(astronautId: string, sessionId: string): Promise<VisionObservation | null>;
}
export interface ScheduleReader {
  getDay(astronautId: string, date: string): Promise<ScheduleSnapshot>;
  findSharedResourceConflicts?(schedule: ScheduleSnapshot): Promise<string[]>;
}
export interface ScheduleProvider extends ScheduleReader {
  // Current snapshot by id; used by the approval service to check staleness before
  // recording a decision. Returns null when the schedule is unknown to this provider.
  getById(scheduleId: string): Promise<ScheduleSnapshot | null>;
  // Called ONLY by the approval service after a persisted authorized APPROVE decision.
  // Provider must verify that authorization via the decision ID/trusted service boundary.
  // Atomic version check + mutation + durable deduplication by proposalId/decisionId.
  applyApproved(command: ScheduleApplyCommand): Promise<ScheduleApplyResult>;
  // Same successful result on replay; UNKNOWN until a definitive result is available.
  getApplication(proposalId: string, decisionId: string): Promise<ScheduleApplyResult>;
}
export interface ScheduleValidator {
  validate(input: {
    schedule: ScheduleSnapshot;
    candidate: ProposalCandidate;
    context: OperationalContext;
  }): ScheduleValidationResult;
}
export interface IdentityProvider {
  // Adapter validates credentials. Never constructs a role from request JSON.
  authenticate(credentials: {
    authorizationHeader: string | null;
    sessionCookie: string | null;
  }): Promise<Identity | null>;
}

export interface Page<T> { items: T[]; nextCursor: string | null }
export interface GenerationArtifacts {
  report: GroundReport;
  diary: DiaryEntry;
  proposal: ScheduleProposal | null;
  noChangeReason: string | null;
}
export interface GenerationClaim {
  checkInId: string;
  token: string;
  leaseExpiresAt: string;
}

/**
 * Persistence boundary for N1. Every lookup is astronaut-scoped; services must first
 * authorize the identity. Methods marked atomic must use transactions/CAS in N1.
 * Conflicts use the error codes in contracts/common.ts; do not silently overwrite.
 * No network/AI calls inside database transactions.
 */
export interface AgentRepository {
  createSession(session: ConversationSession): Promise<ConversationSession>;
  getSessionState(
    astronautId: string, sessionId: string, beforeMessageId?: string,
  ): Promise<SessionState | null>;
  getTurn(
    astronautId: string, sessionId: string, clientMessageId: string,
  ): Promise<{ request: SendMessageRequest; result: MessageResult } | null>;
  // Atomic: persist both messages and draft, check revision (null for first draft),
  // deduplicate clientMessageId; different payload with same ID => IDEMPOTENCY_CONFLICT.
  commitTurn(input: {
    astronautId: string;
    sessionId: string;
    request: SendMessageRequest;
    expectedCheckInRevision: number | null;
    result: MessageResult;
  }): Promise<MessageResult>;
  getCheckIn(astronautId: string, checkInId: string): Promise<CheckIn | null>;
  listPreviousCheckIns(astronautId: string, limit: number): Promise<CheckIn[]>;
  // Atomic revision check; updates allowed only for drafts. Increment revision.
  updateCheckIn(astronautId: string, checkInId: string, request: UpdateCheckInRequest): Promise<CheckIn>;
  // Atomic CAS. Identical confirmation replay returns existing result;
  // a changed sharing selection/revision after confirmation is a conflict.
  confirmCheckIn(astronautId: string, checkInId: string, request: ConfirmCheckInRequest): Promise<CheckIn>;
  // Atomic lease. Only one worker may generate artifacts; expired claims may be reclaimed.
  claimGeneration(astronautId: string, checkInId: string, leaseMs: number): Promise<GenerationClaim | null>;
  // Atomic, token/lease checked: publish all artifacts and mark READY, once per check-in.
  completeGeneration(claim: GenerationClaim, artifacts: GenerationArtifacts): Promise<void>;
  failGeneration(claim: GenerationClaim): Promise<void>;
  getProposal(astronautId: string, proposalId: string): Promise<ScheduleProposal | null>;
  listProposals(query: ListQuery): Promise<Page<ScheduleProposal>>;
  // Atomic decision + status. Global proposal decision is immutable. A retry with
  // the same key/payload returns the original result; changed payload => conflict.
  recordDecision(input: {
    astronautId: string;
    proposalId: string;
    operatorId: string;
    idempotencyKey: string;
    request: DecideProposalRequest;
  }): Promise<{ proposal: ScheduleProposal; decision: ProposalDecision }>;
  // Atomic legal transition only; UNKNOWN preserves APPROVED for reconciliation.
  recordApplication(input: {
    astronautId: string; proposalId: string; decisionId: string; result: ScheduleApplyResult;
  }): Promise<ScheduleProposal>;
  markProposalStale(astronautId: string, proposalId: string): Promise<ScheduleProposal>;
  listReports(query: ListQuery): Promise<Page<GroundReport>>;
  listDiary(astronautId: string, cursor?: string, limit?: number): Promise<Page<DiaryEntry>>;
  updateDiary(astronautId: string, diaryId: string, request: UpdateDiaryRequest): Promise<DiaryEntry>;
}

// A conversation service receives read-only schedule access, never ScheduleProvider.
export type ConversationRepository = Pick<AgentRepository,
  "createSession" | "getSessionState" | "getTurn" | "commitTurn" | "listPreviousCheckIns"
>;

export interface ConversationDependencies {
  ai: ConversationAiProvider;
  repository: ConversationRepository;
  sensors: SensorProvider;
  schedule: ScheduleReader;
  vision?: VisionObservationReader;
}
