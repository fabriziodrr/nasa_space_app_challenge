// Fictional demonstration identities. IDs are demo keys, not verified identities.
import originalSleep from "./nasa_sensor_demo.json";

type Trial = { status: "response" | "false_start" | "missed"; rt_ms?: number };
export type DemoCrewProfile = {
  id: string; name: string; role: string; sleep: (typeof originalSleep)[number];
  mood: { mood_rating: number; alertness: number; sleep_quality: number; observed_at: string };
  trials: Trial[];
};

const makeSleep = (id: string, hours: number, latency: number, awake: number, awakenings: number, rem: number, hrv: number) => ({
  ...originalSleep[0], observation_id: `${id}-sleep-20261115`, subject_id: id,
  sleep_hours: hours, sleep_latency_minutes: latency, wake_after_sleep_onset_minutes: awake,
  awakenings_count: awakenings, sleep_efficiency_percent: Math.round(hours / 8 * 1000) / 10,
  sleep_stages: { ...originalSleep[0].sleep_stages, rem_minutes: rem },
  heart_rate_variability: { ...originalSleep[0].heart_rate_variability, value_ms: hrv },
});
const observed_at = "2026-11-15T08:00:00Z";

export const demoCrew: DemoCrewProfile[] = [
  { id: "sleep-demo-14d", name: "Alex Rossi", role: "Mission commander", sleep: originalSleep[0], mood: { mood_rating: 3, alertness: 5, sleep_quality: 3, observed_at }, trials: [{ status: "response", rt_ms: 360 }, { status: "response", rt_ms: 420 }, { status: "missed" }] },
  { id: "crew-demo-02", name: "Maya Conti", role: "Flight engineer", sleep: makeSleep("crew-demo-02", 7.4, 15, 21, 1, 98, 56), mood: { mood_rating: 4, alertness: 8, sleep_quality: 4, observed_at }, trials: [{ status: "response", rt_ms: 285 }, { status: "response", rt_ms: 310 }, { status: "response", rt_ms: 295 }] },
  { id: "crew-demo-03", name: "Noah Ferri", role: "Science specialist", sleep: makeSleep("crew-demo-03", 5.8, 35, 61, 4, 65, 38), mood: { mood_rating: 2, alertness: 4, sleep_quality: 2, observed_at }, trials: [{ status: "response", rt_ms: 410 }, { status: "response", rt_ms: 530 }, { status: "missed" }] },
  { id: "crew-demo-04", name: "Sara Leone", role: "Medical officer", sleep: makeSleep("crew-demo-04", 7.0, 18, 35, 2, 88, 49), mood: { mood_rating: 4, alertness: 7, sleep_quality: 4, observed_at }, trials: [{ status: "response", rt_ms: 320 }, { status: "response", rt_ms: 305 }, { status: "false_start" }] },
  { id: "crew-demo-05", name: "Liam Serra", role: "Systems engineer", sleep: makeSleep("crew-demo-05", 6.7, 22, 42, 2, 82, 45), mood: { mood_rating: 3, alertness: 6, sleep_quality: 3, observed_at }, trials: [{ status: "response", rt_ms: 335 }, { status: "response", rt_ms: 375 }, { status: "response", rt_ms: 350 }] },
];
