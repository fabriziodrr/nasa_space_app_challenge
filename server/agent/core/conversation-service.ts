import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  CheckInSchema, ConversationOutputSchema, ConversationSessionSchema, CreateSessionRequestSchema,
  IdSchema, MessageResultSchema, ObservationFieldSchema, ScheduleSnapshotSchema,
  SendMessageRequestSchema, SensorReadingSchema, SessionQuerySchema, SessionStateSchema, VisionObservationSchema,
  type AstronautIdentity, type Identity, type MessageResult,
  type Observation, type SendMessageRequest,
} from "../contracts";
import type {
  ConversationContext, ConversationDependencies,
} from "../ports";
import { AgentError, invalidAiOutput, isAgentError, sameMessage } from "./errors";
import { withDeadline } from "./deadline";

export interface ConversationServiceDependencies extends ConversationDependencies {
  now?: () => Date;
  newId?: () => string;
  timeoutMs?: number;
  contextMessageLimit?: number;
  previousCheckInLimit?: number;
  visionQuality?: { minValidMs: number; minCoverage: number; maxAgeMinutes: number };
}

function astronaut(identity: Identity | null): AstronautIdentity {
  if (identity === null) throw new AgentError("UNAUTHENTICATED", "Autenticazione richiesta.");
  if (identity.role !== "ASTRONAUT") throw new AgentError("FORBIDDEN", "Funzione riservata all'astronauta.");
  return identity;
}

function fromAdapter<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new AgentError("INTERNAL_ERROR", "Dati del servizio non validi.");
  return parsed.data;
}

function savedTurn(value: unknown, astronautId: string, sessionId: string, request: SendMessageRequest): MessageResult {
  const saved = fromAdapter(MessageResultSchema, value);
  if (saved.checkIn.astronautId !== astronautId || saved.checkIn.sessionId !== sessionId
      || saved.astronautMessage.sessionId !== sessionId || saved.assistantMessage.sessionId !== sessionId
      || saved.astronautMessage.role !== "ASTRONAUT" || saved.assistantMessage.role !== "ASSISTANT"
      || saved.astronautMessage.text !== request.text || saved.astronautMessage.inputMode !== request.inputMode) {
    throw new AgentError("INTERNAL_ERROR", "Turno salvato non valido.");
  }
  return saved;
}

function buildContext(context: ConversationContext, messageLimit: number): ConversationContext {
  context.messages = context.messages.slice(-messageLimit);
  context.sensors = context.sensors.slice(-48);
  const size = () => JSON.stringify(context).length;
  while (size() > 64_000 && context.previousCheckIns.length) context.previousCheckIns.pop();
  while (size() > 64_000 && context.messages.length > 1) context.messages.shift();
  while (size() > 64_000 && context.visionObservations.length) context.visionObservations.shift();
  while (size() > 64_000 && context.sensors.length) context.sensors.shift();
  if (size() > 64_000) {
    throw new AgentError("PROVIDER_UNAVAILABLE", "Il contesto supera i limiti configurati per la conversazione.");
  }
  return context;
}

function validatedObservations(
  raw: unknown, context: ConversationContext, currentId: string, newId: () => string,
): { reply: string; observations: Observation[] } {
  const parsed = ConversationOutputSchema.safeParse(raw);
  if (!parsed.success) throw invalidAiOutput();
  const output = parsed.data;
  const previous = context.draft?.observations ?? [];
  // Full snapshots prevent accidental loss of previously collected information.
  if (previous.some((old) => !output.observations.some((o) => o.field === old.field))) throw invalidAiOutput();
  const missing = ObservationFieldSchema.options.filter((field) => !output.observations.some((o) => o.field === field));
  if (new Set(output.missingFields).size !== output.missingFields.length
      || missing.length !== output.missingFields.length
      || missing.some((field) => !output.missingFields.includes(field))) throw invalidAiOutput();

  const observations = output.observations.map((candidate): Observation => {
    const old = previous.find((o) => o.field === candidate.field);
    // Keep trusted provenance even if its message is outside the bounded context.
    if (old && old.value === candidate.value
        && JSON.stringify(old.messageIds) === JSON.stringify(candidate.messageIds)) return old;
    const refs = candidate.messageIds.map((id) => context.messages.find((m) => m.id === id && m.role === "ASTRONAUT"));
    if (!candidate.messageIds.includes(currentId) || refs.some((ref) => !ref)
        || new Set(candidate.messageIds).size !== candidate.messageIds.length) throw invalidAiOutput();
    const recordedAt = refs.map((ref) => ref!.createdAt).sort().at(-1)!;
    // Identity and timestamps are assigned by the server, never by model output.
    return { ...candidate, id: old?.id ?? newId(), recordedAt };
  });
  return { reply: output.reply, observations };
}

export function createConversationService(deps: ConversationServiceDependencies) {
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? randomUUID;
  const timeoutMs = deps.timeoutMs ?? 30_000;
  const messageLimit = deps.contextMessageLimit ?? 20;
  const historyLimit = deps.previousCheckInLimit ?? 3;
  const quality = deps.visionQuality ?? { minValidMs: 30_000, minCoverage: 0.7, maxAgeMinutes: 120 };
  if (!Number.isInteger(messageLimit) || messageLimit < 1 || messageLimit > 100
      || !Number.isInteger(historyLimit) || historyLimit < 0 || historyLimit > 10
      || !Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000
      || !Number.isInteger(quality.minValidMs) || quality.minValidMs < 1 || quality.minValidMs > 3_600_000
      || !Number.isFinite(quality.minCoverage) || quality.minCoverage < 0 || quality.minCoverage > 1
      || !Number.isInteger(quality.maxAgeMinutes) || quality.maxAgeMinutes < 1 || quality.maxAgeMinutes > 10_080) {
    throw new Error("Invalid conversation service limits");
  }
  const inFlight = new Map<string, { request: SendMessageRequest; promise: Promise<MessageResult> }>();

  async function getSession(identity: Identity | null, sessionId: string, query: unknown = {}) {
    const actor = astronaut(identity);
    const id = IdSchema.parse(sessionId);
    const parsedQuery = SessionQuerySchema.parse(query);
    const state = await deps.repository.getSessionState(actor.astronautId, id, parsedQuery.beforeMessageId);
    if (!state) throw new AgentError("NOT_FOUND", "Sessione non trovata.");
    const parsed = fromAdapter(SessionStateSchema, state);
    if (parsed.session.astronautId !== actor.astronautId) throw new AgentError("NOT_FOUND", "Sessione non trovata.");
    return parsed;
  }

  async function runTurn(actor: AstronautIdentity, sessionId: string, request: SendMessageRequest, signal?: AbortSignal) {
    const state = await getSession(actor, sessionId);
    const replay = await deps.repository.getTurn(actor.astronautId, sessionId, request.clientMessageId);
    if (replay) {
      if (!sameMessage(replay.request, request)) throw new AgentError("IDEMPOTENCY_CONFLICT", "ID messaggio gia usato con contenuto diverso.");
      return savedTurn(replay.result, actor.astronautId, sessionId, request);
    }
    if (state.session.closedAt !== null || state.checkIn?.status === "CONFIRMED") {
      throw new AgentError("INVALID_STATE", "Check-in concluso. Apri una nuova sessione.");
    }
    const timestamp = now().toISOString();
    const astronautMessage = {
      id: newId(), sessionId, role: "ASTRONAUT" as const, text: request.text,
      createdAt: timestamp, inputMode: request.inputMode,
    };
    const [rawSensors, rawSchedule, previousCheckIns, rawVision] = await Promise.all([
      deps.sensors.read(actor.astronautId, {
        from: new Date(Date.parse(timestamp) - 24 * 60 * 60 * 1000).toISOString(), to: timestamp,
      }),
      deps.schedule.getDay(actor.astronautId, timestamp.slice(0, 10)),
      historyLimit ? deps.repository.listPreviousCheckIns(actor.astronautId, historyLimit) : Promise.resolve([]),
      deps.vision ? deps.vision.getSelectedForSession(actor.astronautId, sessionId) : Promise.resolve(null),
    ]);
    const sensors = fromAdapter(SensorReadingSchema.array().max(500), rawSensors);
    const schedule = fromAdapter(ScheduleSnapshotSchema, rawSchedule);
    const history = fromAdapter(CheckInSchema.array().max(10), previousCheckIns);
    const vision = rawVision === null ? null : fromAdapter(VisionObservationSchema, rawVision);
    if (schedule.astronautId !== actor.astronautId || schedule.date !== timestamp.slice(0, 10)
        || sensors.some((s) => s.astronautId !== actor.astronautId)
        || history.some((c) => c.astronautId !== actor.astronautId || c.status !== "CONFIRMED")
        || (vision && (vision.astronautId !== actor.astronautId || vision.sessionId !== sessionId))) {
      throw new AgentError("INTERNAL_ERROR", "Contesto della conversazione non disponibile.");
    }
    if (vision) {
      if (vision.source === "synthetic" && !vision.reasons.includes("SYNTHETIC_TIME_UNAVAILABLE")) {
        throw new AgentError("INTERNAL_ERROR", "Provenienza della misura non valida.");
      }
      if (vision.endedAt && Date.parse(vision.endedAt) > Date.parse(timestamp) + 5 * 60_000) {
        throw new AgentError("INTERNAL_ERROR", "Orario della misura non valido.");
      }
    }
    const reasons = new Set(vision?.reasons ?? []);
    if (vision) {
      if (!vision.validMs) reasons.add("NO_VALID_TIME");
      if (vision.validMs < quality.minValidMs) reasons.add("TOO_SHORT");
      if (vision.coverage === null || vision.coverage < quality.minCoverage) reasons.add("LOW_COVERAGE");
      if (vision.endedAt && Date.parse(timestamp) - Date.parse(vision.endedAt) > quality.maxAgeMinutes * 60_000) reasons.add("STALE");
      if (vision.interruption && vision.interruption !== "user_stop") reasons.add("INTERRUPTED");
    }
    const visionSummary = vision ? [{ id: vision.id, source: vision.source, usability: reasons.size ? "INSUFFICIENT" as const : "USABLE" as const,
      reasons: [...reasons],
      elapsedMs: vision.elapsedMs, validMs: vision.validMs, coverage: vision.coverage,
      closureFraction: vision.closureFraction, completeCount: vision.completeCount, incompleteCount: vision.incompleteCount,
      prolongedCount: vision.prolongedCount, longestCompleteMs: vision.longestCompleteMs, interruption: vision.interruption,
      startedAt: vision.startedAt, endedAt: vision.endedAt, importedAt: vision.importedAt }] : [];
    const context = buildContext({
      astronautId: actor.astronautId, messages: [...state.messages, astronautMessage],
      draft: state.checkIn, previousCheckIns: history.slice(0, historyLimit),
      sensors: sensors.sort((a, b) => a.observedAt.localeCompare(b.observedAt)), schedule, visionObservations: visionSummary,
    }, messageLimit);
    let rawOutput: unknown;
    try {
      rawOutput = await withDeadline((providerSignal) => deps.ai.converse(structuredClone(context), { signal: providerSignal }), timeoutMs, signal);
    } catch (error) {
      if (isAgentError(error)) throw error;
      throw new AgentError("PROVIDER_UNAVAILABLE", "Servizio AI temporaneamente non disponibile.", true);
    }
    const output = validatedObservations(rawOutput, context, astronautMessage.id, newId);
    const checkIn = CheckInSchema.parse({
      id: state.checkIn?.id ?? newId(), astronautId: actor.astronautId, sessionId,
      revision: (state.checkIn?.revision ?? 0) + 1, status: "DRAFT",
      observations: output.observations, sharedObservationIds: [],
      createdAt: state.checkIn?.createdAt ?? timestamp, confirmedAt: null,
    });
    const result = MessageResultSchema.parse({
      astronautMessage,
      assistantMessage: {
        id: newId(), sessionId, role: "ASSISTANT", text: output.reply,
        createdAt: now().toISOString(), inputMode: "TEXT",
      },
      checkIn,
    });
    if (signal?.aborted) throw new AgentError("PROVIDER_TIMEOUT", "Richiesta interrotta.", true);
    const saved = await deps.repository.commitTurn({
      astronautId: actor.astronautId, sessionId, request,
      expectedCheckInRevision: state.checkIn?.revision ?? null, result,
    });
    return savedTurn(saved, actor.astronautId, sessionId, request);
  }

  return {
    async createSession(identity: Identity | null, input: unknown) {
      const actor = astronaut(identity);
      const request = CreateSessionRequestSchema.parse(input);
      if (request.astronautId !== actor.astronautId) throw new AgentError("NOT_FOUND", "Astronauta non trovato.");
      const saved = await deps.repository.createSession(ConversationSessionSchema.parse({
        id: newId(), astronautId: actor.astronautId, openedAt: now().toISOString(), closedAt: null,
      }));
      const parsed = fromAdapter(ConversationSessionSchema, saved);
      if (parsed.astronautId !== actor.astronautId) throw new AgentError("INTERNAL_ERROR", "Sessione salvata non valida.");
      return parsed;
    },
    getSession,
    async sendMessage(identity: Identity | null, sessionId: string, input: unknown, signal?: AbortSignal) {
      const actor = astronaut(identity);
      IdSchema.parse(sessionId);
      const request = SendMessageRequestSchema.parse(input);
      const key = JSON.stringify([actor.astronautId, sessionId, request.clientMessageId]);
      const running = inFlight.get(key);
      if (running) {
        if (!sameMessage(running.request, request)) throw new AgentError("IDEMPOTENCY_CONFLICT", "ID messaggio gia usato con contenuto diverso.");
        return structuredClone(await running.promise);
      }
      const promise = runTurn(actor, sessionId, request, signal);
      inFlight.set(key, { request, promise });
      try { return structuredClone(await promise); }
      finally { inFlight.delete(key); }
    },
  };
}

export type ConversationService = ReturnType<typeof createConversationService>;
