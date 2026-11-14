// Approval cycle: verifies the ground operator, records an immutable decision and,
// for APPROVE, applies the authorized variation through the schedule provider with
// an atomic version check and durable deduplication. Only APPLIED yields a schedule.
import type {
  DecideProposalRequest, DecisionResult, Identity, ScheduleApplyCommand,
  ScheduleProposal,
} from "../contracts";
import type { AgentRepository, ScheduleProvider } from "../ports";
import { AgentErrors } from "../errors";

export class ApprovalService {
  constructor(
    private readonly repository: AgentRepository,
    private readonly schedule: ScheduleProvider,
  ) {}

  async decide(input: {
    identity: Identity;
    proposalId: string;
    idempotencyKey: string;
    request: DecideProposalRequest;
  }): Promise<DecisionResult> {
    const { identity, proposalId, idempotencyKey, request } = input;
    if (identity.role !== "GROUND_CONTROL") throw AgentErrors.forbidden();

    let proposal: ScheduleProposal | null = null;
    for (const astronautId of identity.astronautIds) {
      proposal = await this.repository.getProposal(astronautId, proposalId);
      if (proposal) break;
    }
    if (!proposal) throw AgentErrors.notFound();
    const astronautId = proposal.astronautId;

    const currentSchedule = await this.schedule.getById(proposal.scheduleId);
    if (!currentSchedule || currentSchedule.astronautId !== astronautId) {
      throw AgentErrors.notFound();
    }

    if (proposal.status === "STALE") {
      throw AgentErrors.versionConflict("La proposta e obsoleta.", currentSchedule.version);
    }
    if (proposal.status === "PENDING_REVIEW" && currentSchedule.version !== proposal.baseScheduleVersion) {
      await this.repository.markProposalStale(astronautId, proposalId);
      throw AgentErrors.versionConflict(
        "La proposta usa una versione obsoleta del programma.",
        currentSchedule.version,
      );
    }

    const { proposal: decided, decision } = await this.repository.recordDecision({
      astronautId,
      proposalId,
      operatorId: identity.userId,
      idempotencyKey,
      request,
    });

    if (decision.decision === "REJECT") {
      return { decision, proposal: decided, schedule: null };
    }

    const command: ScheduleApplyCommand = {
      astronautId,
      scheduleId: decided.scheduleId,
      proposalId,
      decisionId: decision.id,
      expectedScheduleVersion: decided.baseScheduleVersion,
      changes: decided.candidate.changes,
    };
    const result = await this.schedule.applyApproved(command);
    const applied = await this.repository.recordApplication({
      astronautId,
      proposalId,
      decisionId: decision.id,
      result,
    });

    if (result.outcome === "STALE") {
      throw AgentErrors.versionConflict(
        "Il programma e cambiato durante la decisione; la proposta e obsoleta.",
        result.currentVersion,
      );
    }

    return {
      decision,
      proposal: applied,
      schedule: result.outcome === "APPLIED" ? result.schedule : null,
    };
  }
}
