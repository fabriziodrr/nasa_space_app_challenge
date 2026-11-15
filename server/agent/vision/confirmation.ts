import type { PrismaClient } from "@prisma/client";
import { ConfirmCheckInWithVisionRequestSchema, ScheduleSnapshotSchema, SensorReadingSchema, VisionObservationSchema, VisionSelectionSchema, type CheckIn, type VisionSelection } from "../contracts";
import { AgentError } from "../core/errors";
import { checkInFromRow } from "../adapters/prisma/mappers";
import type { ScheduleReader, SensorProvider } from "../ports";
import { evaluateVisionQuality, type VisionQualityConfig } from "./quality";

export class VisionConfirmationService {
  constructor(private readonly prisma: PrismaClient, private readonly sensors: SensorProvider, private readonly quality: VisionQualityConfig, private readonly schedule?: ScheduleReader, private readonly now: () => Date = () => new Date()) {}

  async confirm(astronautId: string, checkInId: string, raw: unknown): Promise<{ checkIn: CheckIn; vision: VisionSelection }> {
    const request = ConfirmCheckInWithVisionRequestSchema.parse(raw);
    const current = await this.prisma.checkIn.findFirst({ where: { id: checkInId, astronautId } });
    if (!current) throw new AgentError("NOT_FOUND", "Check-in not found.");
    if (current.status === "CONFIRMED") {
      const snapshot = await this.prisma.checkInContextSnapshot.findFirst({ where: { checkInId, astronautId } });
      if (!snapshot) throw new AgentError("INVALID_STATE", "Historical context unavailable: open a new check-in.");
      if (current.revision !== request.expectedRevision + 1 || current.sharedObservationIdsJson !== JSON.stringify(request.sharedObservationIds)
          || snapshot.selectionJson !== JSON.stringify(request.vision)) throw new AgentError("INVALID_STATE", "Confirmation already recorded with different data.");
      return { checkIn: checkInFromRow(current), vision: request.vision };
    }
    const now = this.now();
    const readings = SensorReadingSchema.array().max(500).parse(await this.sensors.read(astronautId, {
      from: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(), to: now.toISOString(),
    }));
    if (readings.some((reading) => reading.astronautId !== astronautId)) throw new AgentError("INTERNAL_ERROR", "Invalid sensors.");
    const program = this.schedule ? ScheduleSnapshotSchema.parse(await this.schedule.getDay(astronautId, now.toISOString().slice(0, 10))) : null;
    if (program && program.astronautId !== astronautId) throw new AgentError("INTERNAL_ERROR", "Invalid schedule.");
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.checkIn.findFirst({ where: { id: checkInId, astronautId } });
      if (!row) throw new AgentError("NOT_FOUND", "Check-in not found.");
      if (row.status === "CONFIRMED") {
        const snapshot = await tx.checkInContextSnapshot.findFirst({ where: { checkInId, astronautId } });
        if (!snapshot) throw new AgentError("INVALID_STATE", "Historical context unavailable: open a new check-in.");
        if (row.revision !== request.expectedRevision + 1 || row.sharedObservationIdsJson !== JSON.stringify(request.sharedObservationIds)
            || snapshot.selectionJson !== JSON.stringify(request.vision)) throw new AgentError("INVALID_STATE", "Confirmation already recorded with different data.");
        return { checkIn: checkInFromRow(row), vision: request.vision };
      }
      if (row.revision !== request.expectedRevision) throw new AgentError("VERSION_CONFLICT", "The draft changed.");
      const checkIn = checkInFromRow(row);
      if (!request.sharedObservationIds.every((id) => checkIn.observations.some((observation) => observation.id === id))) throw new AgentError("INVALID_STATE", "Shared observation not present.");
      let vision = null;
      if (request.vision.visionObservationId) {
        const selected = await tx.visionSelection.findFirst({ where: { sessionId: row.sessionId, astronautId, observationId: request.vision.visionObservationId } });
        const measurement = await tx.visionObservation.findFirst({ where: { id: request.vision.visionObservationId, sessionId: row.sessionId, astronautId } });
        if (!selected || !measurement) throw new AgentError("NOT_FOUND", "Selected measurement not found.");
        const parsed = VisionObservationSchema.parse(JSON.parse(measurement.summaryJson));
        if (request.vision.shareWithGround) vision = { ...parsed, ...evaluateVisionQuality(parsed, now, this.quality) };
      }
      const updated = await tx.checkIn.updateMany({ where: { id: checkInId, astronautId, status: "DRAFT", revision: request.expectedRevision }, data: {
        status: "CONFIRMED", revision: { increment: 1 }, sharedObservationIdsJson: JSON.stringify(request.sharedObservationIds), confirmedAt: now,
      } });
      if (updated.count !== 1) throw new AgentError("VERSION_CONFLICT", "The draft changed.");
      await tx.checkInContextSnapshot.create({ data: { checkInId, astronautId, selectionJson: JSON.stringify(request.vision),
        sensorsJson: JSON.stringify(readings), visionJson: vision ? JSON.stringify(vision) : null,
        qualityJson: JSON.stringify(this.quality), scheduleJson: program ? JSON.stringify(program) : null, confirmedAt: now } });
      const saved = await tx.checkIn.findUniqueOrThrow({ where: { id: checkInId } });
      return { checkIn: checkInFromRow(saved), vision: request.vision };
    });
  }

  async getFrozenSensors(astronautId: string, checkInId: string) {
    return (await this.getFrozenContext(astronautId, checkInId)).sensors;
  }

  async getFrozenContext(astronautId: string, checkInId: string) {
    const snapshot = await this.prisma.checkInContextSnapshot.findFirst({ where: { astronautId, checkInId } });
    if (!snapshot) throw new AgentError("INVALID_STATE", "Historical context unavailable: open a new check-in.");
    const selection = VisionSelectionSchema.parse(JSON.parse(snapshot.selectionJson));
    const vision = snapshot.visionJson === null ? null : VisionObservationSchema.parse(JSON.parse(snapshot.visionJson));
    if ((selection.shareWithGround && (!vision || vision.id !== selection.visionObservationId || vision.astronautId !== astronautId))
        || (!selection.shareWithGround && vision !== null)) throw new AgentError("INTERNAL_ERROR", "Invalid frozen vision context.");
    const schedule = snapshot.scheduleJson ? ScheduleSnapshotSchema.parse(JSON.parse(snapshot.scheduleJson)) : null;
    if (schedule && schedule.astronautId !== astronautId) throw new AgentError("INTERNAL_ERROR", "Invalid frozen schedule.");
    return { sensors: SensorReadingSchema.array().max(500).parse(JSON.parse(snapshot.sensorsJson)), vision, schedule };
  }
}
