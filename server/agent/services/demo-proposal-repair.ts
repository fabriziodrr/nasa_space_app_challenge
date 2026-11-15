import { randomUUID } from "node:crypto";
import type { OperationalContext, ProposalCandidate, ScheduleSnapshot } from "../contracts";
import { ProposalService, type BuildProposalResult } from "./proposals";

/** Align an AI-requested short break with a future activity, then apply the full validator. */
export function repairDemoProposal(candidate: ProposalCandidate, context: OperationalContext, schedule: ScheduleSnapshot,
  proposals: ProposalService, now = Date.now()): BuildProposalResult | null {
  const rest = candidate.changes.find((change) => change.type === "ADD_REST");
  const move = candidate.changes.find((change) => change.type === "MOVE_ACTIVITY");
  if (candidate.changes.length !== 2 || !rest || !move) return null;
  const duration = Date.parse(rest.endsAt) - Date.parse(rest.startsAt);
  if (duration <= 0 || duration > 20 * 60_000) return null;
  const earliest = Math.max(now, Date.parse(context.checkIn.confirmedAt));
  const activities = schedule.activities.filter((activity) => activity.kind === "MISSION" && activity.movable
    && activity.priority !== "CRITICAL" && Date.parse(activity.startsAt) > earliest)
    .sort((a, b) => Number(b.id === move.activityId) - Number(a.id === move.activityId) || Date.parse(a.startsAt) - Date.parse(b.startsAt));
  for (const activity of activities) {
    const start = Date.parse(activity.startsAt);
    const adjusted: ProposalCandidate = {
      rationale: `${candidate.rationale.slice(0, 7700)}\nTiming and activity selected from the current schedule by the demo scheduler.`,
      evidence: candidate.evidence,
      changes: [
        { type: "ADD_REST", activityId: randomUUID(), title: rest.title, startsAt: new Date(start).toISOString(), endsAt: new Date(start + duration).toISOString() },
        { type: "MOVE_ACTIVITY", activityId: activity.id, startsAt: new Date(start + duration).toISOString(), endsAt: new Date(Date.parse(activity.endsAt) + duration).toISOString() },
      ],
    };
    const result = proposals.build(adjusted, context, schedule);
    if (result.outcome === "proposal") return result;
  }
  return null;
}
