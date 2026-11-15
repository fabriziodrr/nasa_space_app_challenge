export interface FakeDay {
  id: string;
  title: string;
  sleepHours: number;
  sleepQuality: number;
  fatigue: number;
  presence: number;
  mentalNote: string;
  stressor: string;
}

export interface ProfileSignal {
  label: string;
  detail: string;
  level: "ok" | "watch" | "warn";
}

export interface PsychProfile {
  labels: string[];
  sleepQuality: number[];
  fatigue: number[];
  presence: number[];
  signals: ProfileSignal[];
}

export const FAKE_DAYS: FakeDay[] = [
  { id: "d6", title: "Day 6", sleepHours: 7.5, sleepQuality: 4, fatigue: 1, presence: 9, mentalNote: "Clear and focused.", stressor: "None." },
  { id: "d5", title: "Day 5", sleepHours: 7, sleepQuality: 4, fatigue: 2, presence: 8, mentalNote: "Good sync with the crew.", stressor: "A noisy valve." },
  { id: "d4", title: "Day 4", sleepHours: 6.5, sleepQuality: 3, fatigue: 2, presence: 7, mentalNote: "Some trouble focusing.", stressor: "A bit of a clunky procedure with Ground." },
  { id: "d3", title: "Day 3", sleepHours: 6, sleepQuality: 3, fatigue: 3, presence: 7, mentalNote: "Ok.", stressor: "Module light too bright." },
  { id: "d2", title: "Day 2", sleepHours: 5.5, sleepQuality: 2, fatigue: 4, presence: 5, mentalNote: "Autopilot.", stressor: "Persistent noise." },
  { id: "d1", title: "Day 1", sleepHours: 5, sleepQuality: 2, fatigue: 4, presence: 5, mentalNote: "Usual routine.", stressor: "Constant small annoyances." },
];

const avg = (values: number[]) => values.reduce((a, b) => a + b, 0) / (values.length || 1);

export function buildProfile(days: FakeDay[]): PsychProfile {
  const labels = days.map((d) => d.title);
  const sleepQuality = days.map((d) => d.sleepQuality);
  const fatigue = days.map((d) => d.fatigue);
  const presence = days.map((d) => d.presence);
  const last = days[days.length - 1];
  const signals: ProfileSignal[] = [];

  if (avg(sleepQuality) < 3) signals.push({ label: "Recovery below threshold", detail: "Average sleep quality under 3/5: monitor rest.", level: "watch" });
  if (avg(fatigue) >= 3) signals.push({ label: "Growing fatigue", detail: "Reported fatigue has been rising over the last few days.", level: "watch" });
  if (last && last.presence <= 5) signals.push({ label: "Declining presence", detail: "'Autopilot' responses: possible third-quarter slump.", level: "warn" });
  if (days.some((d) => /noise|light|valve|sound/i.test(d.stressor))) signals.push({ label: "Sensory sensitivity", detail: "Recurring mentions of noise/light: possible space asthenia.", level: "watch" });
  if (days.some((d) => /^(ok|usual routine|autopilot)\.?$/i.test(d.mentalNote.trim()))) signals.push({ label: "Short responses (masking)", detail: "Responses getting shorter and identical: possible defensive masking.", level: "watch" });
  if (!signals.length) signals.push({ label: "No signal", detail: "Patterns within normal range.", level: "ok" });

  return { labels, sleepQuality, fatigue, presence, signals };
}
