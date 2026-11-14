// Validates a proposal candidate against the schedule and the confirmed, shared
// operational context. Rules follow docs/agent/contracts-v1.md ("Vincoli del programma").
import type {
  OperationalContext, ProposalCandidate, ScheduleSnapshot,
  ScheduleValidationResult,
} from "../contracts";
import type { ScheduleValidator } from "../ports";
import { activitiesOverlap, applyScheduleChanges, hasDependencyCycle } from "../lib/schedule";

type ViolationCode =
  | "UNKNOWN_ACTIVITY" | "LOCKED_ACTIVITY" | "DURATION_CHANGED" | "OVERLAP"
  | "DEPENDENCY_VIOLATION" | "OUTSIDE_WINDOW" | "OUTSIDE_DAY" | "DUPLICATE_ACTIVITY"
  | "VERSION_CONFLICT" | "UNSHARED_EVIDENCE";
type Violation = { code: ViolationCode; activityId: string | null; message: string };

export class ScheduleValidatorImpl implements ScheduleValidator {
  validate(input: {
    schedule: ScheduleSnapshot;
    candidate: ProposalCandidate;
    context: OperationalContext;
  }): ScheduleValidationResult {
    const { schedule, candidate, context } = input;
    const violations: Violation[] = [];

    const sharedIds = new Set(context.checkIn.observations.map((o) => o.id));
    const sensorIds = new Set(context.sensors.map((s) => s.id));
    for (const ref of candidate.evidence) {
      const ok = ref.source === "self_report"
        ? sharedIds.has(ref.observationId)
        : ref.source === "sensor" ? sensorIds.has(ref.sensorReadingId)
        : context.vision?.id === ref.visionObservationId && context.vision.source === "webcam" && context.vision.usability === "USABLE";
      if (!ok) {
        violations.push({
          code: "UNSHARED_EVIDENCE",
          activityId: null,
          message: "La proposta cita un'evidenza non condivisa o assente dal contesto operativo.",
        });
      }
    }

    const existing = new Map(schedule.activities.map((a) => [a.id, a]));
    for (const change of candidate.changes) {
      if (change.type === "MOVE_ACTIVITY") {
        const activity = existing.get(change.activityId);
        if (!activity) {
          violations.push({
            code: "UNKNOWN_ACTIVITY",
            activityId: change.activityId,
            message: "Attivita inesistente nello snapshot del programma.",
          });
          continue;
        }
        if (!activity.movable || activity.priority === "CRITICAL") {
          violations.push({
            code: "LOCKED_ACTIVITY",
            activityId: change.activityId,
            message: "L'attivita e bloccata o critica e non puo essere spostata.",
          });
        }
        const originalDuration = Date.parse(activity.endsAt) - Date.parse(activity.startsAt);
        const movedDuration = Date.parse(change.endsAt) - Date.parse(change.startsAt);
        if (originalDuration !== movedDuration) {
          violations.push({
            code: "DURATION_CHANGED",
            activityId: change.activityId,
            message: "Lo spostamento non preserva la durata dell'attivita.",
          });
        }
        if (Date.parse(change.startsAt) < Date.parse(activity.earliestStart)
          || Date.parse(change.endsAt) > Date.parse(activity.latestEnd)) {
          violations.push({
            code: "OUTSIDE_WINDOW",
            activityId: change.activityId,
            message: "Lo spostamento esce dalla finestra consentita dell'attivita.",
          });
        }
      } else if (existing.has(change.activityId)) {
        violations.push({
          code: "DUPLICATE_ACTIVITY",
          activityId: change.activityId,
          message: "L'identificativo della nuova attivita esiste gia nel programma.",
        });
      }
    }

    const resulting = applyScheduleChanges(schedule, candidate.changes).activities;
    const dayStartsAt = Date.parse(schedule.dayStartsAt);
    const dayEndsAt = Date.parse(schedule.dayEndsAt);
    for (const activity of resulting) {
      if (Date.parse(activity.startsAt) < dayStartsAt || Date.parse(activity.endsAt) > dayEndsAt) {
        violations.push({
          code: "OUTSIDE_DAY",
          activityId: activity.id,
          message: "L'attivita esce dai limiti della giornata del programma.",
        });
      }
    }
    for (let i = 0; i < resulting.length; i += 1) {
      for (let j = i + 1; j < resulting.length; j += 1) {
        if (activitiesOverlap(resulting[i], resulting[j])) {
          violations.push({
            code: "OVERLAP",
            activityId: resulting[i].id,
            message: "Il risultato contiene attivita sovrapposte.",
          });
        }
      }
    }
    for (const activity of resulting) {
      for (const depId of activity.dependsOn) {
        const dependency = resulting.find((a) => a.id === depId);
        if (!dependency) {
          violations.push({
            code: "DEPENDENCY_VIOLATION",
            activityId: activity.id,
            message: "Dipendenza mancante nel programma risultante.",
          });
        } else if (Date.parse(dependency.endsAt) > Date.parse(activity.startsAt)) {
          violations.push({
            code: "DEPENDENCY_VIOLATION",
            activityId: activity.id,
            message: "Una dipendenza non termina prima dell'attivita dipendente.",
          });
        }
      }
    }
    if (hasDependencyCycle(resulting)) {
      violations.push({
        code: "DEPENDENCY_VIOLATION",
        activityId: null,
        message: "Le dipendenze del programma risultante formano un ciclo.",
      });
    }

    const unique = this.#dedupe(violations).slice(0, 100);
    if (unique.length > 0) {
      return { valid: false, violations: unique };
    }
    return { valid: true, preview: applyScheduleChanges(schedule, candidate.changes) };
  }

  #dedupe(violations: Violation[]): Violation[] {
    const seen = new Set<string>();
    const result: Violation[] = [];
    for (const violation of violations) {
      const key = `${violation.code}|${violation.activityId ?? ""}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(violation);
      }
    }
    return result;
  }
}
