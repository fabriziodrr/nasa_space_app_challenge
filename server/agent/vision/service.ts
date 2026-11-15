import { createHash, randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { IdSchema, VisionObservationSchema, type VisionObservation } from "../contracts";
import { AgentError } from "../core/errors";
import type { VisionObservationReader } from "../ports";
import { convertValidatedVisionExport } from "./convert-export";
import { validateExport } from "./validate-export";
import type { VisionQualityConfig } from "./quality";

export class VisionService implements VisionObservationReader {
  constructor(private readonly prisma: PrismaClient, private readonly quality: VisionQualityConfig) {}

  async import(astronautId: string, sessionId: string, requestKey: string, bytes: Uint8Array, signal?: AbortSignal): Promise<VisionObservation> {
    IdSchema.parse(sessionId); IdSchema.parse(requestKey);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const existing = await this.prisma.visionObservation.findUnique({ where: { astronautId_sessionId_requestKey: { astronautId, sessionId, requestKey } } });
    if (existing) {
      if (existing.sha256 !== sha256) throw new AgentError("IDEMPOTENCY_CONFLICT", "Key already used with different content.");
      return VisionObservationSchema.parse(JSON.parse(existing.summaryJson));
    }
    const session = await this.prisma.conversationSession.findFirst({ where: { id: sessionId, astronautId } });
    if (!session) throw new AgentError("NOT_FOUND", "Session not found.");
    const checkIn = await this.prisma.checkIn.findUnique({ where: { sessionId } });
    if (session.closedAt || checkIn?.status === "CONFIRMED") throw new AgentError("INVALID_STATE", "Session closed.");
    let text: string;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { throw new AgentError("VALIDATION_ERROR", "The file must be valid UTF-8."); }
    const validated = await validateExport(text, signal);
    const observation = convertValidatedVisionExport(validated, { id: randomUUID(), astronautId, sessionId, sha256, importedAt: new Date(), quality: this.quality });
    if (signal?.aborted) throw new AgentError("PROVIDER_TIMEOUT", "Import interrupted.", true);
    try {
      await this.prisma.$transaction(async (tx) => {
        const current = await tx.conversationSession.findFirst({ where: { id: sessionId, astronautId } });
        const draft = await tx.checkIn.findUnique({ where: { sessionId } });
        if (!current) throw new AgentError("NOT_FOUND", "Session not found.");
        if (current.closedAt || draft?.status === "CONFIRMED") throw new AgentError("INVALID_STATE", "Session closed.");
        await tx.visionObservation.create({ data: { id: observation.id, astronautId, sessionId, requestKey, sha256,
          summaryJson: JSON.stringify(observation), importedAt: new Date(observation.importedAt) } });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const replay = await this.prisma.visionObservation.findUnique({ where: { astronautId_sessionId_requestKey: { astronautId, sessionId, requestKey } } });
        if (replay?.sha256 === sha256) return VisionObservationSchema.parse(JSON.parse(replay.summaryJson));
        throw new AgentError("IDEMPOTENCY_CONFLICT", "Key already used with different content.");
      }
      throw error;
    }
    return observation;
  }

  async list(astronautId: string, sessionId: string): Promise<VisionObservation[]> {
    if (!await this.prisma.conversationSession.findFirst({ where: { id: sessionId, astronautId } })) throw new AgentError("NOT_FOUND", "Session not found.");
    const rows = await this.prisma.visionObservation.findMany({ where: { astronautId, sessionId }, orderBy: [{ importedAt: "desc" }, { id: "desc" }], take: 100 });
    return rows.map((row) => VisionObservationSchema.parse(JSON.parse(row.summaryJson)));
  }

  async select(astronautId: string, sessionId: string, observationId: string | null): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const session = await tx.conversationSession.findFirst({ where: { id: sessionId, astronautId } });
      if (!session) throw new AgentError("NOT_FOUND", "Session not found.");
      const checkIn = await tx.checkIn.findUnique({ where: { sessionId } });
      if (session.closedAt || checkIn?.status === "CONFIRMED") throw new AgentError("INVALID_STATE", "Session closed.");
      if (observationId && !await tx.visionObservation.findFirst({ where: { id: observationId, astronautId, sessionId } })) throw new AgentError("NOT_FOUND", "Measurement not found.");
      await tx.visionSelection.upsert({ where: { sessionId }, create: { sessionId, astronautId, observationId }, update: { observationId } });
    });
  }

  async getSelectedForSession(astronautId: string, sessionId: string): Promise<VisionObservation | null> {
    const selection = await this.prisma.visionSelection.findFirst({ where: { astronautId, sessionId } });
    if (!selection?.observationId) return null;
    const row = await this.prisma.visionObservation.findFirst({ where: { id: selection.observationId, astronautId, sessionId } });
    if (!row) throw new AgentError("INTERNAL_ERROR", "Invalid selection.");
    return VisionObservationSchema.parse(JSON.parse(row.summaryJson));
  }
}
