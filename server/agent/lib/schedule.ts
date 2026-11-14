// Pure schedule manipulation shared by the validator (service) and the simulated
// schedule provider (adapter). No I/O, no Prisma, no React.
import type { ScheduleActivity, ScheduleChange, ScheduleSnapshot } from "../contracts";

export function byStartThenId(a: ScheduleActivity, b: ScheduleActivity): number {
  const startDiff = Date.parse(a.startsAt) - Date.parse(b.startsAt);
  if (startDiff !== 0) return startDiff;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function activitiesOverlap(a: ScheduleActivity, b: ScheduleActivity): boolean {
  return Date.parse(a.startsAt) < Date.parse(b.endsAt)
    && Date.parse(b.startsAt) < Date.parse(a.endsAt);
}

/**
 * Returns the schedule produced by applying `changes` to `schedule`, with the
 * version advanced by one. Tolerant to malformed changes (unknown activity,
 * duplicate added id) so it can also be used to build a candidate preview: those
 * cases are reported by the validator instead of throwing.
 */
export function applyScheduleChanges(
  schedule: ScheduleSnapshot,
  changes: ScheduleChange[],
): ScheduleSnapshot {
  const byId = new Map<string, ScheduleActivity>(
    schedule.activities.map((a) => [a.id, { ...a, dependsOn: [...a.dependsOn] }]),
  );
  for (const change of changes) {
    if (change.type === "MOVE_ACTIVITY") {
      const activity = byId.get(change.activityId);
      if (activity) {
        activity.startsAt = change.startsAt;
        activity.endsAt = change.endsAt;
      }
    } else {
      if (!byId.has(change.activityId)) {
        byId.set(change.activityId, {
          id: change.activityId,
          title: change.title,
          kind: "REST",
          startsAt: change.startsAt,
          endsAt: change.endsAt,
          priority: "LOW",
          movable: true,
          dependsOn: [],
          earliestStart: schedule.dayStartsAt,
          latestEnd: schedule.dayEndsAt,
        });
      }
    }
  }
  const activities = [...byId.values()].sort(byStartThenId);
  return { ...schedule, version: schedule.version + 1, activities };
}

/** Detects a cycle in the `dependsOn` edges of the given activities. */
export function hasDependencyCycle(activities: ScheduleActivity[]): boolean {
  const ids = new Set(activities.map((a) => a.id));
  const edges = new Map(activities.map((a) => [a.id, a.dependsOn.filter((d) => ids.has(d))]));
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const visit = (id: string): boolean => {
    const c = color.get(id) ?? WHITE;
    if (c === GRAY) return true;
    if (c === BLACK) return false;
    color.set(id, GRAY);
    for (const dep of edges.get(id) ?? []) {
      if (visit(dep)) return true;
    }
    color.set(id, BLACK);
    return false;
  };
  for (const id of ids) {
    if (visit(id)) return true;
  }
  return false;
}
