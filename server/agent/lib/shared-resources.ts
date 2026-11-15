import type { ScheduleSnapshot } from "../contracts";
import { activitiesOverlap } from "./schedule";

/** Resource IDs are exclusive across different crew schedules. */
export function sharedResourceConflicts(schedule: ScheduleSnapshot, peers: ScheduleSnapshot[]): string[] {
  const conflicts = new Set<string>();
  for (const activity of schedule.activities) {
    for (const peer of peers) {
      if (peer.astronautId === schedule.astronautId) continue;
      for (const other of peer.activities) {
        if (!activitiesOverlap(activity, other)) continue;
        for (const resource of activity.sharedResources ?? []) {
          if (other.sharedResources?.includes(resource)) conflicts.add(resource);
        }
      }
    }
  }
  return [...conflicts].sort();
}
