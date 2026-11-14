// Builds an immutable PENDING_REVIEW proposal from an AI candidate once it has been
// validated. The service never applies or approves anything: it only assigns identity
// and status to a validated candidate.
import type {
  OperationalContext, ProposalCandidate, ScheduleProposal, ScheduleSnapshot,
} from "../contracts";
import type { ScheduleValidator } from "../ports";
import { randomId } from "../lib/id";
import { nowIso } from "../lib/time";

export type BuildProposalResult =
  | { outcome: "proposal"; proposal: ScheduleProposal }
  | { outcome: "invalid"; violations: { code: string; activityId: string | null; message: string }[] };

export class ProposalService {
  constructor(private readonly validator: ScheduleValidator) {}

  build(
    candidate: ProposalCandidate,
    context: OperationalContext,
    schedule: ScheduleSnapshot,
  ): BuildProposalResult {
    const validation = this.validator.validate({ schedule, candidate, context });
    if (!validation.valid) {
      return { outcome: "invalid", violations: validation.violations };
    }
    return {
      outcome: "proposal",
      proposal: {
        id: randomId("proposal"),
        astronautId: schedule.astronautId,
        checkInId: context.checkIn.id,
        scheduleId: schedule.id,
        baseScheduleVersion: schedule.version,
        createdAt: nowIso(),
        candidate,
        status: "PENDING_REVIEW",
        decisionId: null,
        appliedScheduleVersion: null,
        appliedAt: null,
      },
    };
  }
}
