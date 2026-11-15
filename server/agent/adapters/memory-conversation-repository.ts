import {
  ConversationSessionSchema, MessageResultSchema,
  type CheckIn, type SessionState, type SendMessageRequest, type MessageResult,
} from "../contracts";
import type { ConversationRepository } from "../ports";
import { AgentError, sameMessage } from "../core/errors";

interface StoredSession {
  state: SessionState;
  turns: Map<string, { request: SendMessageRequest; result: MessageResult }>;
}

/** Development adapter only. No durability or cross-process guarantees. */
export class MemoryConversationRepository implements ConversationRepository {
  private readonly sessions = new Map<string, StoredSession>();

  private owned(astronautId: string, sessionId: string): StoredSession | null {
    const stored = this.sessions.get(sessionId);
    return stored?.state.session.astronautId === astronautId ? stored : null;
  }

  async createSession(input: Parameters<ConversationRepository["createSession"]>[0]) {
    const session = ConversationSessionSchema.parse(input);
    if (this.sessions.has(session.id)) throw new AgentError("INVALID_STATE", "Session already exists.");
    if (this.sessions.size >= 500) throw new AgentError("RATE_LIMITED", "Demo repository limit reached. Restart the demo.");
    this.sessions.set(session.id, {
      state: {
        session: structuredClone(session), messages: [], nextMessageCursor: null, checkIn: null,
        generationStatus: "NOT_STARTED", reportId: null, diaryEntryId: null,
        proposal: null, noChangeReason: null,
      },
      turns: new Map(),
    });
    return structuredClone(session);
  }

  async getSessionState(astronautId: string, sessionId: string, beforeMessageId?: string) {
    const stored = this.owned(astronautId, sessionId);
    if (!stored) return null;
    const all = stored.state.messages;
    const end = beforeMessageId === undefined ? all.length : all.findIndex((m) => m.id === beforeMessageId);
    if (end < 0) throw new AgentError("NOT_FOUND", "Message cursor not found.");
    const start = Math.max(0, end - 200);
    return structuredClone({
      ...stored.state, messages: all.slice(start, end), nextMessageCursor: start > 0 ? all[start].id : null,
    });
  }

  async getTurn(astronautId: string, sessionId: string, clientMessageId: string) {
    const turn = this.owned(astronautId, sessionId)?.turns.get(clientMessageId);
    return turn ? structuredClone(turn) : null;
  }

  async commitTurn(input: Parameters<ConversationRepository["commitTurn"]>[0]) {
    // No await within this mutation: check + write are atomic in this process.
    const stored = this.owned(input.astronautId, input.sessionId);
    if (!stored) throw new AgentError("NOT_FOUND", "Session not found.");
    const existing = stored.turns.get(input.request.clientMessageId);
    if (existing) {
      if (!sameMessage(existing.request, input.request)) throw new AgentError("IDEMPOTENCY_CONFLICT", "Message ID already used.");
      return structuredClone(existing.result);
    }
    if (stored.state.session.closedAt !== null || stored.state.checkIn?.status === "CONFIRMED") {
      throw new AgentError("INVALID_STATE", "Check-in closed.");
    }
    if ((stored.state.checkIn?.revision ?? null) !== input.expectedCheckInRevision) {
      throw new AgentError("VERSION_CONFLICT", "The draft changed. Reload the session and try again.", true);
    }
    if (stored.state.messages.length >= 2000) throw new AgentError("RATE_LIMITED", "Demo session too long. Open a new session.");
    const result = MessageResultSchema.parse(input.result);
    if (result.checkIn.astronautId !== input.astronautId || result.checkIn.sessionId !== input.sessionId
        || result.astronautMessage.sessionId !== input.sessionId || result.assistantMessage.sessionId !== input.sessionId
        || result.astronautMessage.role !== "ASTRONAUT" || result.assistantMessage.role !== "ASSISTANT"
        || result.checkIn.status !== "DRAFT" || result.checkIn.sharedObservationIds.length !== 0
        || result.checkIn.revision !== (input.expectedCheckInRevision ?? 0) + 1
        || (stored.state.checkIn && result.checkIn.id !== stored.state.checkIn.id)) {
      throw new AgentError("INTERNAL_ERROR", "Inconsistent turn result.");
    }
    const saved = structuredClone(result);
    stored.state.messages.push(saved.astronautMessage, saved.assistantMessage);
    stored.state.checkIn = saved.checkIn;
    stored.turns.set(input.request.clientMessageId, { request: structuredClone(input.request), result: saved });
    return structuredClone(saved);
  }

  async listPreviousCheckIns(astronautId: string, limit: number): Promise<CheckIn[]> {
    return structuredClone([...this.sessions.values()]
      .map((stored) => stored.state.checkIn)
      .filter((checkIn): checkIn is CheckIn => checkIn !== null
        && checkIn.astronautId === astronautId && checkIn.status === "CONFIRMED")
      .sort((a, b) => (b.confirmedAt ?? "").localeCompare(a.confirmedAt ?? "") || b.id.localeCompare(a.id))
      .slice(0, limit));
  }
}
