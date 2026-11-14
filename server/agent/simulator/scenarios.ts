// Reproducible demo scenarios for the simulated sensors and the seeded program.
// Values are explicitly demonstrative and must not be read as clinical criteria.
import type { ScheduleSnapshot, Scenario, SensorReading } from "../contracts";

export const DEMO_ASTRONAUT_ID = "astro-1";
export const DEMO_GROUND_ID = "ground-1";
export const DEMO_DATE = "2026-11-14";
export const DEMO_TIME_ZONE = "Etc/UTC";
export const DEMO_SENSOR_TIME = "2026-11-14T05:55:00Z";

export const SCENARIOS: readonly Scenario[] = ["RESTED", "POOR_SLEEP", "CONFLICTING_DATA"];

export interface ScenarioDefinition {
  id: Scenario;
  label: string;
  sleepHours: number;
  interruptions: number;
  restingHeartRate: number;
  /** What the astronaut reports, possibly conflicting with the sensors. */
  selfReport: {
    sleepHours: number;
    sleepQuality: number;
    fatigue: number;
  };
}

export const SCENARIO_DEFINITIONS: Record<Scenario, ScenarioDefinition> = {
  RESTED: {
    id: "RESTED",
    label: "Riposo regolare",
    sleepHours: 8,
    interruptions: 1,
    restingHeartRate: 60,
    selfReport: { sleepHours: 8, sleepQuality: 4, fatigue: 1 },
  },
  POOR_SLEEP: {
    id: "POOR_SLEEP",
    label: "Riposo insufficiente",
    sleepHours: 4.8,
    interruptions: 6,
    restingHeartRate: 72,
    selfReport: { sleepHours: 4.5, sleepQuality: 2, fatigue: 4 },
  },
  CONFLICTING_DATA: {
    id: "CONFLICTING_DATA",
    label: "Dati discordanti",
    sleepHours: 8,
    interruptions: 1,
    restingHeartRate: 60,
    selfReport: { sleepHours: 4, sleepQuality: 2, fatigue: 4 },
  },
};

export function sensorReadings(scenario: Scenario, astronautId = DEMO_ASTRONAUT_ID): SensorReading[] {
  const definition = SCENARIO_DEFINITIONS[scenario];
  const base = {
    astronautId,
    observedAt: DEMO_SENSOR_TIME,
    source: "sensor" as const,
    simulated: true as const,
    scenario,
    quality: "GOOD" as const,
  };
  return [
    { ...base, id: "sensor-sleep", metric: "SLEEP_DURATION", value: definition.sleepHours, unit: "h" },
    { ...base, id: "sensor-wakes", metric: "SLEEP_INTERRUPTION_COUNT", value: definition.interruptions, unit: "count" },
    { ...base, id: "sensor-hr", metric: "RESTING_HEART_RATE", value: definition.restingHeartRate, unit: "bpm" },
  ];
}

/**
 * Minimal program used by every scenario (see docs/agent/examples/normal.json).
 * The simulated schedule provider seeds and evolves this snapshot.
 */
export function baseSchedule(
  astronautId = DEMO_ASTRONAUT_ID,
  date = DEMO_DATE,
): ScheduleSnapshot {
  return {
    id: "schedule-1",
    astronautId,
    date,
    timeZone: DEMO_TIME_ZONE,
    version: 1,
    dayStartsAt: `${date}T06:00:00Z`,
    dayEndsAt: `${date}T22:00:00Z`,
    activities: [
      {
        id: "comm-1",
        title: "Collegamento Terra",
        kind: "MISSION",
        startsAt: `${date}T08:00:00Z`,
        endsAt: `${date}T08:30:00Z`,
        priority: "CRITICAL",
        movable: false,
        dependsOn: [],
        earliestStart: `${date}T08:00:00Z`,
        latestEnd: `${date}T08:30:00Z`,
      },
      {
        id: "science-1",
        title: "Inventario campioni",
        kind: "MISSION",
        startsAt: `${date}T09:00:00Z`,
        endsAt: `${date}T09:40:00Z`,
        priority: "NORMAL",
        movable: true,
        dependsOn: ["comm-1"],
        earliestStart: `${date}T09:00:00Z`,
        latestEnd: `${date}T16:00:00Z`,
      },
    ],
  };
}
