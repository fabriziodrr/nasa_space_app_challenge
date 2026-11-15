import { randomUUID } from "node:crypto";
import type { OperationalContext, ProposalCandidate, ScheduleSnapshot } from "../contracts";
import { repairDemoProposal } from "./demo-proposal-repair";
import { ProposalService } from "./proposals";

/** Reserve time for clarification, with full schedule validation and ground approval. */
export function discrepancyProposal(context: OperationalContext, schedule: ScheduleSnapshot, proposals: ProposalService) {
  const reported = context.checkIn.observations.find((o) => o.field === "SLEEP_HOURS");
  const measured = context.sensors.find((o) => o.metric === "SLEEP_DURATION" && o.quality === "GOOD" && o.value !== null && (!o.provenance || o.provenance.identityLink === "demo_mapped"));
  if (typeof reported?.value !== "number" || measured?.value == null || Math.abs(reported.value - measured.value) < 1) return null;
  const activity = schedule.activities.find((a) => a.kind === "MISSION" && a.movable && a.priority !== "CRITICAL");
  if (!activity) return null;
  const start = Date.parse(activity.startsAt), duration = 10 * 60_000;
  const candidate: ProposalCandidate = {
    rationale: `Data discrepancy: speech reports ${reported.value} h of sleep; spacecraft data reports ${measured.value} h${measured.simulated ? " (simulated)" : ""}. Propose a 10-minute review break to clarify period and reliability with the astronaut. This discrepancy does not establish impairment. Houston approval required.`,
    evidence: [{ source: "self_report", observationId: reported.id }, { source: "sensor", sensorReadingId: measured.id }],
    changes: [{ type: "ADD_REST", activityId: randomUUID(), title: "Review conflicting sleep data", startsAt: activity.startsAt, endsAt: new Date(start + duration).toISOString() },
      { type: "MOVE_ACTIVITY", activityId: activity.id, startsAt: new Date(start + duration).toISOString(), endsAt: new Date(Date.parse(activity.endsAt) + duration).toISOString() }],
  };
  return repairDemoProposal(candidate, context, schedule, proposals);
}
