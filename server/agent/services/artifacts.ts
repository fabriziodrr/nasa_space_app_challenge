import { randomUUID } from "node:crypto";
import {
  DiaryEntrySchema, DiaryOutputSchema, GroundReportSchema, OperationalContextSchema,
  OperationalOutputSchema, SharedCheckInSchema,
  type Identity,
} from "../contracts";
import type { AgentRepository, DiaryAiProvider, OperationalAiProvider, ScheduleReader, SensorProvider } from "../ports";
import { AgentErrors } from "../core/errors";
import { ProposalService } from "./proposals";
import type { VisionConfirmationService } from "../vision/confirmation";

/** Generates both artifacts from a confirmed check-in using separate privacy boundaries. */
export class ArtifactService {
  constructor(private readonly deps: {
    repository: AgentRepository;
    operationalAi: OperationalAiProvider;
    diaryAi: DiaryAiProvider;
    sensors: SensorProvider;
    schedule: ScheduleReader;
    proposals: ProposalService;
    frozenContext?: VisionConfirmationService;
    // Only enable after connecting an authoritative, versioned schedule provider.
    allowProposals?: boolean;
  }) {}

  async generate(identity: Identity, checkInId: string): Promise<void> {
    if (identity.role !== "ASTRONAUT") throw AgentErrors.forbidden();
    const { repository, sensors, schedule, operationalAi, diaryAi, proposals } = this.deps;
    const checkIn = await repository.getCheckIn(identity.astronautId, checkInId);
    if (!checkIn) throw AgentErrors.notFound();
    if (checkIn.status !== "CONFIRMED" || !checkIn.confirmedAt) throw AgentErrors.invalidState("The check-in is not confirmed.");
    const claim = await repository.claimGeneration(identity.astronautId, checkIn.id, 120_000);
    if (!claim) return;
    try {
      const selected = new Set(checkIn.sharedObservationIds);
      const shared = SharedCheckInSchema.parse({
        id: checkIn.id, astronautId: checkIn.astronautId, confirmedAt: checkIn.confirmedAt,
        observations: checkIn.observations.filter((o) => selected.has(o.id)).map((observation) => {
          const { messageIds: _messageIds, ...safe } = observation;
          void _messageIds;
          return safe;
        }),
      });
      const end = checkIn.confirmedAt;
      const from = new Date(Date.parse(end) - 24 * 60 * 60 * 1000).toISOString();
      const frozen = this.deps.frozenContext ? await this.deps.frozenContext.getFrozenContext(identity.astronautId, checkIn.id)
        : { sensors: await sensors.read(identity.astronautId, { from, to: end }), vision: null, schedule: null };
      const [day, state] = await Promise.all([
        frozen.schedule ? Promise.resolve(frozen.schedule) : schedule.getDay(identity.astronautId, end.slice(0, 10)),
        repository.getSessionState(identity.astronautId, checkIn.sessionId),
      ]);
      const { sensors: readings, vision } = frozen;
      if (!state || state.session.astronautId !== identity.astronautId || day.astronautId !== identity.astronautId
          || (vision && (vision.astronautId !== identity.astronautId || vision.sessionId !== checkIn.sessionId))
          || readings.some((reading) => reading.astronautId !== identity.astronautId)) throw AgentErrors.internal("Invalid context.");
      const visibleVision = vision ? { id: vision.id, source: vision.source, startedAt: vision.startedAt, endedAt: vision.endedAt,
        elapsedMs: vision.elapsedMs, validMs: vision.validMs, coverage: vision.coverage, closureFraction: vision.closureFraction,
        completeCount: vision.completeCount, incompleteCount: vision.incompleteCount, prolongedCount: vision.prolongedCount,
        longestCompleteMs: vision.longestCompleteMs, interruption: vision.interruption, usability: vision.usability, reasons: vision.reasons } : null;
      const context = OperationalContextSchema.parse({ checkIn: shared, sensors: readings, vision: visibleVision });
      const [rawOperational, rawDiary] = await Promise.all([
        operationalAi.generateOperational({ context: structuredClone(context), schedule: structuredClone(day) }),
        diaryAi.generateDiary({ astronautId: identity.astronautId, messages: state.messages, checkIn }),
      ]);
      const operational = OperationalOutputSchema.parse(rawOperational);
      const diaryOutput = DiaryOutputSchema.parse(rawDiary);
      if (context.vision) {
        const item = context.vision;
        const note = `Eyelid measurement ${item.source === "synthetic" ? "synthetic" : "webcam"}; status ${item.usability}; `
          + `interval ${item.startedAt ?? "unavailable"} – ${item.endedAt ?? "unavailable"}; `
          + `valid time ${item.validMs} ms; coverage ${item.coverage ?? "unavailable"}; `
          + `limitations: ${item.reasons.length ? item.reasons.join(", ") : "none reported"}. Experimental, non-diagnostic measurement.`;
        operational.report.uncertainties = [note, ...operational.report.uncertainties].slice(0, 20);
      }
      const sensorIds = new Set(readings.map((reading) => reading.id));
      for (const finding of [...operational.report.findings, ...operational.report.discrepancies]) {
        for (const evidence of finding.evidence) {
          const allowed = evidence.source === "self_report" ? selected.has(evidence.observationId)
            : evidence.source === "sensor" ? sensorIds.has(evidence.sensorReadingId)
            : context.vision?.id === evidence.visionObservationId && context.vision.source === "webcam" && context.vision.usability === "USABLE";
          if (!allowed) {
            throw AgentErrors.invalidAiOutput("The report contains evidence that is not shared or unavailable.");
          }
        }
      }
      let proposal = null;
      if (operational.proposal) {
        if (!this.deps.allowProposals) throw AgentErrors.invalidAiOutput("Proposal generation is not yet connected to the authoritative schedule.");
        if (this.deps.frozenContext && !frozen.schedule) throw AgentErrors.invalidState("The check-in has no frozen schedule: open a new check-in.");
        const built = proposals.build(operational.proposal, context, day);
        if (built.outcome === "proposal") proposal = built.proposal;
        else {
          operational.proposal = null;
          operational.noChangeReason = "The generated recommendation does not satisfy the schedule constraints; keep the schedule and request a Ground review.";
          operational.report.humanReview = { required: true, reason: "The automatic proposal does not pass schedule validation." };
        }
      }
      const now = new Date().toISOString();
      const report = GroundReportSchema.parse({
        ...operational.report, id: randomUUID(), astronautId: identity.astronautId,
        checkInId: checkIn.id, generatedAt: now, proposalId: proposal?.id ?? null,
      });
      const diary = DiaryEntrySchema.parse({
        id: randomUUID(), astronautId: identity.astronautId, checkInId: checkIn.id,
        date: end.slice(0, 10), text: diaryOutput.text, revision: 1,
        status: "DRAFT", visibility: "PRIVATE", updatedAt: now,
      });
      await repository.completeGeneration(claim, { report, diary, proposal, noChangeReason: operational.noChangeReason });
    } catch (error) {
      try { await repository.failGeneration(claim); } catch { /* Preserve original error. */ }
      throw error;
    }
  }
}
