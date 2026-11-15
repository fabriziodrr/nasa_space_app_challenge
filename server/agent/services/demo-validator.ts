import type { OperationalContext, ProposalCandidate, ScheduleSnapshot, ScheduleValidationResult } from "../contracts";
import { ScheduleValidatorImpl } from "./validator";

/** Conservative prototype policy, distinct from NASA operational requirements. */
export class DemoScheduleValidator extends ScheduleValidatorImpl {
  override validate(input: { schedule: ScheduleSnapshot; candidate: ProposalCandidate; context: OperationalContext }): ScheduleValidationResult {
    const base = super.validate(input);
    if (!base.valid) return base;
    const { candidate, schedule, context } = input;
    const move = candidate.changes.find((c) => c.type === "MOVE_ACTIVITY");
    const rest = candidate.changes.find((c) => c.type === "ADD_REST");
    const original = schedule.activities.find((a) => a.id === move?.activityId);
    const restMs = rest ? Date.parse(rest.endsAt) - Date.parse(rest.startsAt) : 0;
    const messages: string[] = [];
    const removal = candidate.changes.find((change) => change.type === "REMOVE_ACTIVITY");
    if (removal) {
      const activity = schedule.activities.find((item) => item.id === removal.activityId);
      if (candidate.changes.length !== 1) messages.push("Removal must be the only proposed change.");
      if (!activity || Date.parse(activity.startsAt) < Date.parse(context.checkIn.confirmedAt)) messages.push("Only a future mission activity can be removed.");
      if (removal.reassignment?.astronautId === schedule.astronautId) messages.push("The recipient must be another crew member.");
    } else if (candidate.changes.length !== 2 || !move || !rest) messages.push("Use exactly one ADD_REST and one MOVE_ACTIVITY.");
    if (move && original && (original.kind !== "MISSION" || !original.movable || original.priority === "CRITICAL")) messages.push("Move a flexible, non-critical mission activity.");
    if (rest && (restMs <= 0 || restMs > 20 * 60_000)) messages.push("The rest break must last at most 20 minutes.");
    if (rest && original && Date.parse(rest.startsAt) !== Date.parse(original.startsAt)) messages.push("Start the rest break at the original start of the moved activity.");
    if (move && rest && Date.parse(move.startsAt) !== Date.parse(rest.endsAt)) messages.push("Start the moved activity exactly when the rest break ends.");
    if (move && rest && original && Date.parse(move.endsAt) !== Date.parse(original.endsAt) + restMs) messages.push("Preserve the moved activity duration by adding the rest duration to its original end.");
    if (original && Date.parse(original.startsAt) < Date.parse(context.checkIn.confirmedAt)) messages.push("Choose an activity that starts after the check-in was confirmed.");
    if (!candidate.evidence.some((ref) => ref.source === "self_report" && context.checkIn.observations.some((o) => o.id === ref.observationId && ["FATIGUE", "SLEEP_HOURS", "SLEEP_QUALITY"].includes(o.field)))) messages.push("Cite a shared sleep-hours, sleep-quality or fatigue observation.");
    if (!candidate.evidence.every((ref) => ref.source !== "self_report" || context.checkIn.observations.some((o) => o.id === ref.observationId && ((o.field !== "FATIGUE" && o.field !== "SLEEP_QUALITY") || o.scaleMax === 10)))) messages.push("Cited fatigue and sleep-quality ratings must use a known 1–10 scale.");
    if (!candidate.evidence.every((ref) => ref.source !== "sensor" || context.sensors.some((s) => s.id === ref.sensorReadingId && s.quality === "GOOD" && (!s.provenance || (s.simulated && s.provenance.identityLink === "demo_mapped" && s.provenance.status === "AVAILABLE" && !s.provenance.truncated))))) messages.push("Cite only eligible, good-quality sensor readings.");
    if (messages.length) return { valid: false, violations: messages.map((message) => ({ code: "OUTSIDE_WINDOW" as const, activityId: move?.activityId ?? null, message })) };
    return base;
  }
}
