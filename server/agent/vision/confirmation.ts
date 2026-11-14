import type { PrismaClient } from "@prisma/client";
import { ConfirmCheckInWithVisionRequestSchema, SensorReadingSchema, VisionObservationSchema, VisionSelectionSchema, type CheckIn, type VisionSelection } from "../contracts";
import { AgentError } from "../core/errors";
import { checkInFromRow } from "../adapters/prisma/mappers";
import type { SensorProvider } from "../ports";
import { evaluateVisionQuality, type VisionQualityConfig } from "./quality";

export class VisionConfirmationService {
  constructor(private readonly prisma: PrismaClient, private readonly sensors: SensorProvider, private readonly quality: VisionQualityConfig) {}

  async confirm(astronautId: string, checkInId: string, raw: unknown): Promise<{ checkIn: CheckIn; vision: VisionSelection }> {
    const request = ConfirmCheckInWithVisionRequestSchema.parse(raw);
    const current = await this.prisma.checkIn.findFirst({ where: { id: checkInId, astronautId } });
    if (!current) throw new AgentError("NOT_FOUND", "Check-in non trovato.");
    if (current.status === "CONFIRMED") {
      const snapshot = await this.prisma.checkInContextSnapshot.findFirst({ where: { checkInId, astronautId } });
      if (!snapshot) throw new AgentError("INVALID_STATE", "Contesto storico non disponibile: apri un nuovo check-in.");
      if (current.revision !== request.expectedRevision + 1 || current.sharedObservationIdsJson !== JSON.stringify(request.sharedObservationIds)
          || snapshot.selectionJson !== JSON.stringify(request.vision)) throw new AgentError("INVALID_STATE", "Conferma già registrata con dati diversi.");
      return { checkIn: checkInFromRow(current), vision: request.vision };
    }
    const now = new Date();
    const readings = SensorReadingSchema.array().max(500).parse(await this.sensors.read(astronautId, {
      from: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(), to: now.toISOString(),
    }));
    if (readings.some((reading) => reading.astronautId !== astronautId)) throw new AgentError("INTERNAL_ERROR", "Sensori non validi.");
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.checkIn.findFirst({ where: { id: checkInId, astronautId } });
      if (!row) throw new AgentError("NOT_FOUND", "Check-in non trovato.");
      if (row.status === "CONFIRMED") {
        const snapshot = await tx.checkInContextSnapshot.findFirst({ where: { checkInId, astronautId } });
        if (!snapshot) throw new AgentError("INVALID_STATE", "Contesto storico non disponibile: apri un nuovo check-in.");
        if (row.revision !== request.expectedRevision + 1 || row.sharedObservationIdsJson !== JSON.stringify(request.sharedObservationIds)
            || snapshot.selectionJson !== JSON.stringify(request.vision)) throw new AgentError("INVALID_STATE", "Conferma già registrata con dati diversi.");
        return { checkIn: checkInFromRow(row), vision: request.vision };
      }
      if (row.revision !== request.expectedRevision) throw new AgentError("VERSION_CONFLICT", "La bozza è cambiata.");
      const checkIn = checkInFromRow(row);
      if (!request.sharedObservationIds.every((id) => checkIn.observations.some((observation) => observation.id === id))) throw new AgentError("INVALID_STATE", "Osservazione condivisa non presente.");
      let vision = null;
      if (request.vision.visionObservationId) {
        const selected = await tx.visionSelection.findFirst({ where: { sessionId: row.sessionId, astronautId, observationId: request.vision.visionObservationId } });
        const measurement = await tx.visionObservation.findFirst({ where: { id: request.vision.visionObservationId, sessionId: row.sessionId, astronautId } });
        if (!selected || !measurement) throw new AgentError("NOT_FOUND", "Misura selezionata non trovata.");
        const parsed = VisionObservationSchema.parse(JSON.parse(measurement.summaryJson));
        if (request.vision.shareWithGround) vision = { ...parsed, ...evaluateVisionQuality(parsed, now, this.quality) };
      }
      const updated = await tx.checkIn.updateMany({ where: { id: checkInId, astronautId, status: "DRAFT", revision: request.expectedRevision }, data: {
        status: "CONFIRMED", revision: { increment: 1 }, sharedObservationIdsJson: JSON.stringify(request.sharedObservationIds), confirmedAt: now,
      } });
      if (updated.count !== 1) throw new AgentError("VERSION_CONFLICT", "La bozza è cambiata.");
      await tx.checkInContextSnapshot.create({ data: { checkInId, astronautId, selectionJson: JSON.stringify(request.vision),
        sensorsJson: JSON.stringify(readings), visionJson: vision ? JSON.stringify(vision) : null,
        qualityJson: JSON.stringify(this.quality), confirmedAt: now } });
      const saved = await tx.checkIn.findUniqueOrThrow({ where: { id: checkInId } });
      return { checkIn: checkInFromRow(saved), vision: request.vision };
    });
  }

  async getFrozenSensors(astronautId: string, checkInId: string) {
    return (await this.getFrozenContext(astronautId, checkInId)).sensors;
  }

  async getFrozenContext(astronautId: string, checkInId: string) {
    const snapshot = await this.prisma.checkInContextSnapshot.findFirst({ where: { astronautId, checkInId } });
    if (!snapshot) throw new AgentError("INVALID_STATE", "Contesto storico non disponibile: apri un nuovo check-in.");
    const selection = VisionSelectionSchema.parse(JSON.parse(snapshot.selectionJson));
    const vision = snapshot.visionJson === null ? null : VisionObservationSchema.parse(JSON.parse(snapshot.visionJson));
    if ((selection.shareWithGround && (!vision || vision.id !== selection.visionObservationId || vision.astronautId !== astronautId))
        || (!selection.shareWithGround && vision !== null)) throw new AgentError("INTERNAL_ERROR", "Contesto visivo congelato non valido.");
    return { sensors: SensorReadingSchema.array().max(500).parse(JSON.parse(snapshot.sensorsJson)), vision };
  }
}
