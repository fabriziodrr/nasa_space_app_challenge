import { ScheduleSnapshotSchema, SensorReadingSchema, type Scenario } from "../contracts";
import type { ScheduleReader, SensorProvider } from "../ports";

// Minimal read-only bootstrap for T1. N1 can replace it without changing the service.
export function createDemoContextProviders(scenario: Scenario): { sensors: SensorProvider; schedule: ScheduleReader } {
  return {
    sensors: {
      async read(astronautId, window) {
        const poor = scenario === "POOR_SLEEP";
        const base = {
          astronautId, observedAt: window.to, source: "sensor", simulated: true,
          scenario, quality: "GOOD",
        };
        return [
          { ...base, id: "demo-sleep", metric: "SLEEP_DURATION", value: poor ? 4.8 : 8, unit: "h" },
          { ...base, id: "demo-wakes", metric: "SLEEP_INTERRUPTION_COUNT", value: poor ? 6 : 1, unit: "count" },
          { ...base, id: "demo-heart", metric: "RESTING_HEART_RATE", value: poor ? 72 : 60, unit: "bpm" },
        ].map((reading) => SensorReadingSchema.parse(reading));
      },
    },
    schedule: {
      async getDay(astronautId, date) {
        return ScheduleSnapshotSchema.parse({
          id: `demo-${date}`, astronautId, date, timeZone: "Etc/UTC", version: 1,
          dayStartsAt: `${date}T06:00:00Z`, dayEndsAt: `${date}T22:00:00Z`,
          activities: [
            { id: "comm-1", title: "Ground contact", kind: "MISSION", startsAt: `${date}T08:00:00Z`,
              endsAt: `${date}T08:30:00Z`, priority: "CRITICAL", movable: false, dependsOn: [],
              earliestStart: `${date}T08:00:00Z`, latestEnd: `${date}T08:30:00Z` },
            { id: "science-1", title: "Sample inventory", kind: "MISSION", startsAt: `${date}T09:00:00Z`,
              endsAt: `${date}T09:40:00Z`, priority: "NORMAL", movable: true, dependsOn: ["comm-1"],
              earliestStart: `${date}T09:00:00Z`, latestEnd: `${date}T16:00:00Z` },
          ],
        });
      },
    },
  };
}
