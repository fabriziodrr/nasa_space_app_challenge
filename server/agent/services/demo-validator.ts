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
    const valid = candidate.changes.length === 2 && move && rest && original
      && original.kind === "MISSION" && original.movable && original.priority !== "CRITICAL"
      && restMs > 0 && restMs <= 20 * 60_000
      && Date.parse(rest.startsAt) === Date.parse(original.startsAt)
      && Date.parse(move.startsAt) === Date.parse(rest.endsAt)
      && Date.parse(move.endsAt) === Date.parse(original.endsAt) + restMs
      && Date.parse(original.startsAt) >= Date.parse(context.checkIn.confirmedAt)
      && candidate.evidence.some((ref) => ref.source === "self_report"
        && context.checkIn.observations.some((o) => o.id === ref.observationId && ["FATIGUE", "SLEEP_HOURS", "SLEEP_QUALITY"].includes(o.field)))
      && candidate.evidence.every((ref) => ref.source !== "self_report" || context.checkIn.observations.some((o) => o.id === ref.observationId
        && ((o.field !== "FATIGUE" && o.field !== "SLEEP_QUALITY") || o.scaleMax === 10)))
      && candidate.evidence.every((ref) => ref.source !== "sensor" || context.sensors.some((s) => s.id === ref.sensorReadingId && s.quality !== "UNAVAILABLE"));
    if (!valid) return { valid: false, violations: [{ code: "OUTSIDE_WINDOW", activityId: move?.activityId ?? null,
      message: "La demo consente solo una pausa fino a 20 minuti prima di una futura attività flessibile, motivata da dichiarazioni condivise sul riposo o sulla stanchezza." }] };
    return base;
  }
}
