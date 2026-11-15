import { randomUUID } from "node:crypto";
import {
  DiaryEntrySchema, DiaryOutputSchema, GroundReportSchema, OperationalContextSchema,
  OperationalOutputSchema, SharedCheckInSchema,
  type Identity, type ProposalCandidate,
} from "../contracts";
import type { AgentRepository, DiaryAiProvider, OperationalAiProvider, ScheduleReader, SensorProvider } from "../ports";
import { AgentErrors, isAgentError } from "../core/errors";
import { ProposalService } from "./proposals";
import { repairDemoProposal } from "./demo-proposal-repair";
import { applyScheduleChanges } from "../lib/schedule";
import { crossSourceSummary } from "./cross-source-summary";
import { withReportMeasurements } from "./report-measurements";
import { discrepancyProposal } from "./discrepancy-proposal";
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
        const note = `Demo data backend: ${backend.backend === "demo_fixture" ? "synthetic fixture" : "data service"}; status ${backend.status}; subject ${backend.subjectId}, ${backend.identityLink === "demo_mapped" ? "synthetic profile linked in the demo" : "unverified identity"}; `
          + `snapshot ${backend.snapshotId ?? "unavailable"}, archive acquisition ${backend.backendAsOf ?? "unavailable"}; period ${backend.periodStart ?? "unavailable"} – ${backend.periodEnd ?? "unavailable"}; `
          + `result ${backend.truncated ? "truncated" : "not truncated"}. Synthetic data, not related to real people.`;
        operational.report.uncertainties = [note, ...operational.report.uncertainties].slice(0, 20);
      }
      const uncertainBackendIds = new Set(readings.filter((reading) => reading.provenance && (reading.provenance.identityLink !== "demo_mapped" || reading.provenance.truncated || reading.quality !== "GOOD")).map((reading) => reading.id));
      const unsafe = (finding: typeof operational.report.findings[number]) => finding.source === "inference"
        && finding.evidence.some((ref) => ref.source === "sensor" && uncertainBackendIds.has(ref.sensorReadingId));
      if ([...operational.report.findings, ...operational.report.discrepancies].some(unsafe)) {
        operational.report.findings = operational.report.findings.filter((finding) => !unsafe(finding));
        operational.report.discrepancies = operational.report.discrepancies.filter((finding) => !unsafe(finding));
        operational.report.uncertainties = ["Deduction over data with an unverified demo identity removed; human review required.", ...operational.report.uncertainties].slice(0, 20);
        operational.report.humanReview = { required: true, reason: "Unverified demo source identity." };
      }
      if (context.vision) {
        const item = context.vision;
        const note = `Eyelid measurement ${item.source === "synthetic" ? "synthetic" : "webcam"}; status ${item.usability}; `
          + `interval ${item.startedAt ?? "unavailable"} – ${item.endedAt ?? "unavailable"}; `
          + `valid time ${item.validMs} ms; coverage ${item.coverage ?? "unavailable"}; `
          + `limitations: ${item.reasons.length ? item.reasons.join(", ") : "none reported"}. Experimental, non-diagnostic measurement.`;
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
        operational.report.uncertainties = ["Some statements were excluded because they lacked shared and available evidence; human review required.", ...operational.report.uncertainties].slice(0, 20);
        operational.report.humanReview = { required: true, reason: "Verify the excluded statements and the available evidence." };
      }
      const combined = crossSourceSummary(context);
      if (combined && operational.report.findings.length < 30) operational.report.findings.push(combined);
      operational.report.findings = operational.report.findings.map((finding) => withReportMeasurements(finding, context));
      let proposal = null;
      phase = "validate proposal";
      if (!operational.proposal && this.deps.allowProposals && operational.report.discrepancies.length && (!this.deps.frozenContext || frozen.schedule)) {
        const suggestion = discrepancyProposal(context, day, proposals);
        if (suggestion?.outcome === "proposal") { operational.proposal = suggestion.proposal.candidate; operational.noChangeReason = null; }
      }
      if (operational.proposal) {
        if (!this.deps.allowProposals) throw AgentErrors.invalidAiOutput("Proposal generation is not yet connected to the authoritative schedule.");
        if (this.deps.frozenContext && !frozen.schedule) throw AgentErrors.invalidState("The check-in has no frozen schedule: open a new check-in.");
        const prepare = async (candidate: ProposalCandidate): Promise<ProposalCandidate> => {
          const changes = await Promise.all(candidate.changes.map(async (change) => change.type === "REMOVE_ACTIVITY"
            ? schedule.planReassignment ? schedule.planReassignment(day, { ...change, reassignment: null }) : { ...change, reassignment: null }
            : change));
          return { ...candidate, changes };
        };
        let built = proposals.build(await prepare(operational.proposal), context, day);
        let declined = false;
        if (built.outcome === "invalid") {
          try {
            const retry = OperationalOutputSchema.parse(await operationalAi.generateOperational({
              context: structuredClone(context), schedule: structuredClone(day),
              proposalFeedback: built.violations.map((violation) => violation.message),
            }));
            if (retry.proposal) built = proposals.build(await prepare(retry.proposal), context, day);
            else if (retry.noChangeReason) { operational.noChangeReason = retry.noChangeReason; declined = true; }
          } catch (error) {
            console.error("Agent proposal retry:", isAgentError(error) ? error.code : "error");
          }
        }
        if (built.outcome === "invalid" && !declined) {
          built = repairDemoProposal(operational.proposal, context, day, proposals) ?? built;
        }
        if (built.outcome === "proposal" && schedule.findSharedResourceConflicts) {
          const conflicts = await schedule.findSharedResourceConflicts(applyScheduleChanges(day, built.proposal.candidate.changes));
          if (conflicts.length) built = { outcome: "invalid", violations: [{ code: "OVERLAP", activityId: null,
            message: `Shared resource conflict: ${conflicts.join(", ")}.` }] };
        }
        if (built.outcome === "proposal") proposal = built.proposal;
        else {
          operational.proposal = null;
          const reasons = [...new Set(built.violations.map((violation) => violation.message))].slice(0, 5).join(" ");
          operational.noChangeReason = operational.noChangeReason ?? `The proposed schedule change was rejected: ${reasons}`;
          operational.report.humanReview = { required: true, reason: `The proposed schedule change was rejected: ${reasons}` };
          operational.report.uncertainties = [`Schedule validation: ${reasons}`, ...operational.report.uncertainties].slice(0, 20);
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
