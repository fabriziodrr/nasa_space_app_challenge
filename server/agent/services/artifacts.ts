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
    if (checkIn.status !== "CONFIRMED" || !checkIn.confirmedAt) throw AgentErrors.invalidState("Il check-in non e confermato.");
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
          || readings.some((reading) => reading.astronautId !== identity.astronautId)) throw AgentErrors.internal("Contesto non valido.");
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
        const note = `Backend dati demo: stato ${backend.status}; soggetto ${backend.subjectId}, ${backend.identityLink === "demo_mapped" ? "profilo sintetico collegato nella demo" : "identità non verificata"}; `
          + `snapshot ${backend.snapshotId ?? "non disponibile"}, acquisizione archivio ${backend.backendAsOf ?? "non disponibile"}; periodo ${backend.periodStart ?? "non disponibile"} – ${backend.periodEnd ?? "non disponibile"}; `
          + `risultato ${backend.truncated ? "troncato" : "non troncato"}. Dati sintetici, non relativi a persone reali.`;
        operational.report.uncertainties = [note, ...operational.report.uncertainties].slice(0, 20);
      }
      const uncertainBackendIds = new Set(readings.filter((reading) => reading.provenance && (reading.provenance.identityLink !== "demo_mapped" || reading.provenance.truncated || reading.quality !== "GOOD")).map((reading) => reading.id));
      const unsafe = (finding: typeof operational.report.findings[number]) => finding.source === "inference"
        && finding.evidence.some((ref) => ref.source === "sensor" && uncertainBackendIds.has(ref.sensorReadingId));
      if ([...operational.report.findings, ...operational.report.discrepancies].some(unsafe)) {
        operational.report.findings = operational.report.findings.filter((finding) => !unsafe(finding));
        operational.report.discrepancies = operational.report.discrepancies.filter((finding) => !unsafe(finding));
        operational.report.uncertainties = ["Deduzione su dati con identità demo non verificata rimossa; richiedere revisione umana.", ...operational.report.uncertainties].slice(0, 20);
        operational.report.humanReview = { required: true, reason: "Identità delle fonti demo non verificata." };
      }
      if (context.vision) {
        const item = context.vision;
        const note = `Misura palpebrale ${item.source === "synthetic" ? "sintetica" : "webcam"}; stato ${item.usability}; `
          + `intervallo ${item.startedAt ?? "non disponibile"} – ${item.endedAt ?? "non disponibile"}; `
          + `tempo valido ${item.validMs} ms; copertura ${item.coverage ?? "non disponibile"}; `
          + `limitazioni: ${item.reasons.length ? item.reasons.join(", ") : "nessuna segnalata"}. Misura sperimentale non diagnostica.`;
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
        operational.report.uncertainties = ["Alcune affermazioni sono state escluse perché prive di evidenze condivise e disponibili; richiedere revisione umana.", ...operational.report.uncertainties].slice(0, 20);
        operational.report.humanReview = { required: true, reason: "Verificare le affermazioni escluse e le evidenze disponibili." };
      }
      let proposal = null;
      phase = "validate proposal";
      if (operational.proposal) {
        if (!this.deps.allowProposals) throw AgentErrors.invalidAiOutput("Generazione delle proposte non ancora collegata al programma autorevole.");
        if (this.deps.frozenContext && !frozen.schedule) throw AgentErrors.invalidState("Il check-in non ha un programma congelato: apri un nuovo check-in.");
        const built = proposals.build(operational.proposal, context, day);
        if (built.outcome === "proposal") proposal = built.proposal;
        else {
          operational.proposal = null;
          operational.noChangeReason = "Il consiglio generato non supera i vincoli del programma; mantenere la schedule e richiedere una revisione di Terra.";
          operational.report.humanReview = { required: true, reason: "La proposta automatica non supera la validazione del programma." };
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
