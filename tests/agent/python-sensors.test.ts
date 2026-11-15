import assert from "node:assert/strict";
import { test } from "node:test";
import { PythonSensorProvider } from "../../server/agent/adapters/python-sensors";
import { demoProgram } from "../../server/agent/adapters/demo-program";
import { DemoScheduleValidator } from "../../server/agent/services/demo-validator";

const window = { from: "2026-11-14T06:00:00Z", to: "2026-11-15T06:00:00Z" };
const measurement = { observation_id: "night-1", subject_id: "sleep-demo-14d", synthetic: true,
  quality: "valid", source: "instrument", observed_at: "2026-11-15T05:00:00+00:00",
  period_start: "2026-11-14T20:00:00+00:00", period_end: "2026-11-15T04:00:00+00:00",
  device_id: "watch-1", method: "demo", sleep_hours: 5.5, awakenings_count: 2 };
function payload(reading: unknown = measurement) {
  return { subject_id: "sleep-demo-14d", synthetic: true, snapshot_id: "snapshot-1", as_of: "2026-11-15T05:00:00Z", truncated: false,
    sleep_context: { latest_measurement: reading } };
}
function provider(value: unknown) {
  return new PythonSensorProvider({ subjectId: "sleep-demo-14d", fetch: async () => Response.json(value) });
}

test("Python sleep readings preserve snapshot and provenance without inventing a heart rate", async () => {
  const readings = await provider(payload()).read("astro-1", window);
  assert.deepEqual(readings.map((r) => [r.metric, r.value]), [["SLEEP_DURATION", 5.5], ["SLEEP_INTERRUPTION_COUNT", 2]]);
  assert.equal(readings[0].quality, "GOOD");
  assert.equal(readings[0].provenance?.identityLink, "demo_mapped");
  assert.equal(readings[0].provenance?.snapshotId, "snapshot-1");
  assert.equal(readings[0].provenance?.periodEnd, "2026-11-15T04:00:00.000Z");
  assert.equal(readings[0].provenance?.observedId, "night-1");
});

test("new sleep measurements reach the agent with their own source and aggregation", async () => {
  const readings = await provider(payload({ ...measurement, sleep_latency_minutes: 0,
    wake_after_sleep_onset_minutes: 48, sleep_efficiency_percent: 77.5,
    sleep_stages: { device_id: "eeg-1", method: "simulated_eeg", rem_minutes: 78 },
    heart_rate_variability: { device_id: "ecg-1", method: "simulated_rmssd", value_ms: 42, aggregation: "nightly" },
  })).read("astro-1", window);
  assert.deepEqual(readings.map((r) => [r.metric, r.value]), [
    ["SLEEP_DURATION", 5.5], ["SLEEP_INTERRUPTION_COUNT", 2], ["SLEEP_LATENCY", 0],
    ["WAKE_AFTER_SLEEP_ONSET", 48], ["SLEEP_EFFICIENCY", 77.5], ["REM_DURATION", 78], ["HEART_RATE_VARIABILITY", 42],
  ]);
  const rem = readings.find((r) => r.metric === "REM_DURATION");
  const hrv = readings.find((r) => r.metric === "HEART_RATE_VARIABILITY");
  assert.equal(rem?.provenance?.deviceId, "eeg-1");
  assert.equal(rem?.provenance?.method, "simulated_eeg");
  assert.equal(hrv?.provenance?.deviceId, "ecg-1");
  assert.equal(hrv?.provenance?.method, "simulated_rmssd");
  assert.equal(hrv?.provenance?.aggregation, "nightly");
  assert.ok(readings.every((r) => r.quality === "GOOD" && r.provenance?.identityLink === "demo_mapped"));
  const [invalid] = await provider(payload({ ...measurement, sleep_stages: {
    device_id: "eeg-1", method: "simulated_eeg", rem_minutes: 400,
  } })).read("astro-1", window);
  assert.equal(invalid.provenance?.status, "INVALID");
});

test("missing, stale, future, wrong-identity and non-synthetic data never become measurements", async () => {
  for (const [data, status] of [
    [payload(null), "MISSING"],
    [payload({ ...measurement, period_start: "2026-11-12T20:00:00Z", period_end: "2026-11-13T04:00:00Z", observed_at: "2026-11-13T05:00:00Z" }), "STALE"],
    [payload({ ...measurement, observed_at: "2026-11-15T07:00:00Z" }), "INVALID"],
    [payload({ ...measurement, subject_id: "other" }), "INVALID"],
    [payload({ ...measurement, synthetic: false }), "INVALID"],
  ] as const) {
    const readings = await provider(data).read("astro-1", window);
    assert.equal(readings[0].quality, "UNAVAILABLE"); assert.equal(readings[0].value, null);
    assert.equal(readings[0].provenance?.status, status);
  }
  assert.equal((await provider(payload()).read("other-astronaut", window))[0].provenance?.status, "INVALID");
});

test("an unavailable backend is explicit and never falls back to demo sensor values", async () => {
  const unavailable = new PythonSensorProvider({ subjectId: "sleep-demo-14d", fetch: async () => { throw new Error("offline"); } });
  const [reading] = await unavailable.read("astro-1", window);
  assert.equal(reading.provenance?.status, "UNAVAILABLE");
  assert.equal(reading.value, null);
});

test("a mapped demo subject can support a proposal but an unverified subject cannot", async () => {
  const sensors = await provider(payload()).read("astro-1", window);
  const result = new DemoScheduleValidator().validate({ schedule: demoProgram("astro-1", "2026-11-15"),
    context: { checkIn: { id: "check", astronautId: "astro-1", confirmedAt: window.to,
      observations: [{ id: "fatigue", source: "self_report", field: "FATIGUE", value: 8, scaleMax: 10, recordedAt: window.to }] }, sensors },
    candidate: { rationale: "Pausa proposta", evidence: [{ source: "self_report", observationId: "fatigue" },
      { source: "sensor", sensorReadingId: sensors[0].id }], changes: [
      { type: "MOVE_ACTIVITY", activityId: "science-1", startsAt: "2026-11-15T09:20:00Z", endsAt: "2026-11-15T10:00:00Z" },
      { type: "ADD_REST", activityId: "rest", title: "Pausa", startsAt: "2026-11-15T09:00:00Z", endsAt: "2026-11-15T09:20:00Z" },
    ] } });
  assert.equal(result.valid, true);
  const unverified = structuredClone(sensors);
  if (unverified[0].provenance) unverified[0].provenance.identityLink = "demo_only_unverified";
  const rejected = new DemoScheduleValidator().validate({ schedule: demoProgram("astro-1", "2026-11-15"),
    context: { checkIn: { id: "check", astronautId: "astro-1", confirmedAt: window.to,
      observations: [{ id: "fatigue", source: "self_report", field: "FATIGUE", value: 8, scaleMax: 10, recordedAt: window.to }] }, sensors: unverified },
    candidate: { rationale: "Pausa proposta", evidence: [{ source: "self_report", observationId: "fatigue" }, { source: "sensor", sensorReadingId: sensors[0].id }], changes: [
      { type: "MOVE_ACTIVITY", activityId: "science-1", startsAt: "2026-11-15T09:20:00Z", endsAt: "2026-11-15T10:00:00Z" },
      { type: "ADD_REST", activityId: "rest", title: "Pausa", startsAt: "2026-11-15T09:00:00Z", endsAt: "2026-11-15T09:20:00Z" },
    ] } });
  assert.equal(rejected.valid, false);
});
