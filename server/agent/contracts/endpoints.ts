import {
  CheckInResponseSchema, ConfirmCheckInRequestSchema, ConfirmCheckInResponseSchema,
  CreateSessionRequestSchema, CreateSessionResponseSchema, DecideProposalRequestSchema,
  DecisionResponseSchema, DiaryListResponseSchema, DiaryResponseSchema,
  IdempotencyHeadersSchema, ListQuerySchema, MessageResponseSchema,
  ProposalListResponseSchema, ReportListResponseSchema, SendMessageRequestSchema,
  SessionQuerySchema, SessionResponseSchema, SpeechRequestSchema,
  TranscriptionMetadataSchema, TranscriptionResponseSchema, UpdateCheckInRequestSchema,
  UpdateDiaryRequestSchema,
} from "./api";

const astronaut = ["ASTRONAUT"] as const;
const both = ["ASTRONAUT", "GROUND_CONTROL"] as const;

// Paths relative to API_BASE_PATH. A contract catalogue, NOT implemented routes.
export const AGENT_ENDPOINTS = {
  createSession: { method: "POST", path: "/sessions", roles: astronaut, successStatus: 201,
    body: CreateSessionRequestSchema, response: CreateSessionResponseSchema },
  sendMessage: { method: "POST", path: "/sessions/:id/messages", roles: astronaut, successStatus: 200,
    body: SendMessageRequestSchema, response: MessageResponseSchema },
  getSession: { method: "GET", path: "/sessions/:id", roles: astronaut, successStatus: 200,
    query: SessionQuerySchema, response: SessionResponseSchema },
  updateCheckIn: { method: "PATCH", path: "/check-ins/:id", roles: astronaut, successStatus: 200,
    body: UpdateCheckInRequestSchema, response: CheckInResponseSchema },
  confirmCheckIn: { method: "POST", path: "/check-ins/:id/confirm", roles: astronaut, successStatus: 202,
    body: ConfirmCheckInRequestSchema, response: ConfirmCheckInResponseSchema },
  listProposals: { method: "GET", path: "/proposals", roles: both, successStatus: 200,
    query: ListQuerySchema, response: ProposalListResponseSchema },
  decideProposal: { method: "POST", path: "/proposals/:id/decision", roles: ["GROUND_CONTROL"], successStatus: 200,
    headers: IdempotencyHeadersSchema, body: DecideProposalRequestSchema, response: DecisionResponseSchema },
  listReports: { method: "GET", path: "/reports", roles: both, successStatus: 200,
    query: ListQuerySchema, response: ReportListResponseSchema },
  listDiary: { method: "GET", path: "/diary", roles: astronaut, successStatus: 200,
    query: ListQuerySchema, response: DiaryListResponseSchema },
  updateDiary: { method: "PATCH", path: "/diary/:id", roles: astronaut, successStatus: 200,
    body: UpdateDiaryRequestSchema, response: DiaryResponseSchema },
  transcribe: { method: "POST", path: "/voice/transcriptions", roles: astronaut, successStatus: 200,
    contentType: "multipart/form-data", metadata: TranscriptionMetadataSchema,
    response: TranscriptionResponseSchema },
  speech: { method: "POST", path: "/voice/speech", roles: astronaut, successStatus: 200,
    body: SpeechRequestSchema, responseContentType: "audio/mpeg" },
} as const;
