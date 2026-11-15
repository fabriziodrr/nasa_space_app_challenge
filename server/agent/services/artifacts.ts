import { randomUUID } from "node:crypto";
import {
  DiaryEntrySchema, DiaryOutputSchema, GroundReportSchema, OperationalContextSchema,
  OperationalOutputSchema, SharedCheckInSchema,
  type Identity,
} from "../contracts";
import type { AgentRepository, DiaryAiProvider, OperationalAiProvider, ScheduleReader, SensorProvider } from "../ports";
import { AgentErrors, isAgentError } from "../core/errors";
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
    let phase = "context";
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
        operationalAi.generateOperational({ context: structuredClone(context), schedule: structuredClone(day) }).catch((error) => { console.error("Agent operation:", isAgentError(error) ? error.code : "error"); throw error; }),
        diaryAi.generateDiary({ astronautId: identity.astronautId, messages: state.messages, checkIn }).catch((error) => { console.error("Agent diary:", isAgentError(error) ? error.code : "error"); throw error; }),
      ]);
      phase = "validate model output";
      const operational = OperationalOutputSchema.parse(rawOperational);
      const diaryOutput = DiaryOutputSchema.parse(rawDiary);
      const backend = readings.find((reading) => reading.provenance)?.provenance;
      if (backend) {
        const note = `Demo backend status: ${backend.status}; subject ${backend.subjectId}, ${backend.identityLink === "demo_mapped" ? "synthetic profile linked in the demo" : "unverified identity"}; `
          + `snapshot ${backend.snapshotId ?? "unavailable"}, archive ingestion ${backend.backendAsOf ?? "unavailable"}; period ${backend.periodStart ?? "unavailable"} – ${backend.periodEnd ?? "unavailable"}; `
          + `result ${backend.truncated ? "truncated" : "not truncated"}. Synthetic data, not records of real people.`;
        operational.report.uncertainties = [note, ...operational.report.uncertainties].slice(0, 20);
      }
      const uncertainBackendIds = new Set(readings.filter((reading) => reading.provenance && (reading.provenance.identityLink !== "demo_mapped" || reading.provenance.truncated || reading.quality !== "GOOD")).map((reading) => reading.id));
      const unsafe = (finding: typeof operational.report.findings[number]) => finding.source === "inference"
        && finding.evidence.some((ref) => ref.source === "sensor" && uncertainBackendIds.has(ref.sensorReadingId));
      if ([...operational.report.findings, ...operational.report.discrepancies].some(unsafe)) {
        operational.report.findings = operational.report.findings.filter((finding) => !unsafe(finding));
        operational.report.discrepancies = operational.report.discrepancies.filter((finding) => !unsafe(finding));
        operational.report.uncertainties = ["Inference based on an unverified demo identity was removed; human review is required.", ...operational.report.uncertainties].slice(0, 20);
        operational.report.humanReview = { required: true, reason: "Demo source identity has not been verified." };
      }
      if (context.vision) {
        const item = context.vision;
        const note = `Eyelid measurement ${item.source === "synthetic" ? "synthetic" : "webcam"}; status ${item.usability}; `
          + `interval ${item.startedAt ?? "unavailable"} – ${item.endedAt ?? "unavailable"}; `
          + `valid time ${item.validMs} ms; coverage ${item.coverage ?? "unavailable"}; `
          + `limitations: ${item.reasons.length ? item.reasons.join(", ") : "none reported"}. Experimental measurement; not diagnostic.`;
        operational.report.uncertainties = [note, ...operational.report.uncertainties].slice(0, 20);
      }
      const sensorIds = new Set(readings.filter((reading) => reading.quality !== "UNAVAILABLE").map((reading) => reading.id));
      phase = "validate report evidence";
      const evidenceAllowed = (finding: typeof operational.report.findings[number]) => finding.evidence.every((evidence) => {
          return evidence.source === "self_report" ? selected.has(evidence.observationId)
            : evidence.source === "sensor" ? sensorIds.has(evidence.sensorReadingId)
            : context.vision?.id === evidence.visionObservationId && context.vision.source === "webcam" && context.vision.usability === "USABLE";
      });
      const invalidFindings = [...operational.report.findings, ...operational.report.discrepancies].some((finding) => !evidenceAllowed(finding));
      if (invalidFindings) {
        operational.report.findings = operational.report.findings.filter(evidenceAllowed);
        operational.report.discrepancies = operational.report.discrepancies.filter(evidenceAllowed);
        operational.report.uncertainties = ["Some statements were excluded because they lack shared, available evidence. Human review is required.", ...operational.report.uncertainties].slice(0, 20);
        operational.report.humanReview = { required: true, reason: "Review the excluded statements and available evidence." };
      }
      let proposal = null;
      phase = "validate proposal";
      if (operational.proposal) {
        if (!this.deps.allowProposals) throw AgentErrors.invalidAiOutput("Proposal generation is not connected to the authoritative schedule.");
        if (this.deps.frozenContext && !frozen.schedule) throw AgentErrors.invalidState("No frozen schedule is available. Start a new check-in.");
        const built = proposals.build(operational.proposal, context, day);
        if (built.outcome === "proposal") proposal = built.proposal;
        else {
          operational.proposal = null;
          operational.noChangeReason = "The suggested change does not meet schedule constraints. Keep the schedule and request ground review.";
          operational.report.humanReview = { required: true, reason: "The proposed change did not pass schedule validation." };
        }
      }
      const now = new Date().toISOString();
      phase = "persist artifacts";
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
      console.error("Agent artifact generation failed:", phase, isAgentError(error) ? error.code : error instanceof Error ? error.name : "unknown error");
      try { await repository.failGeneration(claim); } catch { /* Preserve original error. */ }
      throw error;
    }
  }
}
