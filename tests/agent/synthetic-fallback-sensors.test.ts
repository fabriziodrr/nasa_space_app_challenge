import assert from "node:assert/strict";
import { test } from "node:test";
import { PythonSensorProvider } from "../../server/agent/adapters/python-sensors";
import { SyntheticFallbackSensorProvider } from "../../server/agent/adapters/synthetic-fallback-sensors";
import { demoCrewMappings } from "../../server/agent/demo-crew";

const window = { from: "2026-11-14T08:00:00Z", to: "2026-11-15T08:00:00Z" };
function missingProvider(truncated = false) {
  return new PythonSensorProvider({ subjectId: "sleep-demo-14d", fetch: async (url) => {
    const subject = new URL(String(url)).pathname.split("/")[3];
    return Response.json({ subject_id: subject, synthetic: true, snapshot_id: "python-empty", as_of: null,
      truncated, sleep_context: { latest_measurement: null } });
  } });
}

test("each mapped astronaut receives only its own clearly labeled historical synthetic fixture", async () => {
  const provider = new SyntheticFallbackSensorProvider(missingProvider());
  for (const member of demoCrewMappings) {
    const readings = await provider.read(member.astronautId, window);
    const duration = readings.find((item) => item.metric === "SLEEP_DURATION");
    assert.ok(duration);
    assert.equal(duration.astronautId, member.astronautId);
    assert.equal(duration.provenance?.subjectId, member.subjectId);
    assert.equal(duration.provenance?.backend, "demo_fixture");
    assert.equal(duration.provenance?.status, "AVAILABLE");
    assert.equal(duration.simulated, true);
    assert.equal(duration.quality, "DEGRADED");
    assert.equal(duration.observedAt, "2026-11-15T07:00:00.000Z");
    assert.equal(duration.provenance?.periodEnd, "2026-11-15T07:00:00.000Z");
  }
});

test("a fixture outside the requested interval is marked stale without changing its timestamp", async () => {
  const provider = new SyntheticFallbackSensorProvider(missingProvider());
  const [reading] = await provider.read("crew-demo-03", { from: "2026-11-17T08:00:00Z", to: "2026-11-18T08:00:00Z" });
  assert.equal(reading.value, null);
  assert.equal(reading.quality, "UNAVAILABLE");
  assert.equal(reading.provenance?.backend, "demo_fixture");
  assert.equal(reading.provenance?.status, "STALE");
  assert.equal(reading.provenance?.periodEnd, "2026-11-15T07:00:00.000Z");
});

test("backend outage and truncated or unverified contexts are not replaced by fixtures", async () => {
  const offline = new PythonSensorProvider({ subjectId: "sleep-demo-14d", fetch: async () => { throw new Error("offline"); } });
  const stale = new PythonSensorProvider({ subjectId: "sleep-demo-14d", fetch: async () => Response.json({
    subject_id: "sleep-demo-14d", synthetic: true, snapshot_id: "old", as_of: "2026-11-13T07:00:00Z", truncated: false,
    sleep_context: { latest_measurement: { observation_id: "old-1", subject_id: "sleep-demo-14d", synthetic: true, quality: "valid", source: "instrument",
      observed_at: "2026-11-13T07:00:00Z", period_start: "2026-11-12T23:00:00Z", period_end: "2026-11-13T07:00:00Z",
      device_id: "watch", method: "demo", sleep_hours: 6 } },
  }) });
  for (const [primary, astronautId] of [[offline, "astro-1"], [stale, "astro-1"], [missingProvider(true), "astro-1"], [missingProvider(), "unknown"]] as const) {
    const expected = await primary.read(astronautId, window);
    const result = await new SyntheticFallbackSensorProvider(primary).read(astronautId, window);
    assert.deepEqual(result, expected);
  }
  const unverified = new PythonSensorProvider({ subjectId: "other-subject", fetch: async () => Response.json({
    subject_id: "other-subject", synthetic: true, snapshot_id: "empty", as_of: null,
    truncated: false, sleep_context: { latest_measurement: null },
  }) });
  assert.deepEqual(await new SyntheticFallbackSensorProvider(unverified).read("astro-1", window), await unverified.read("astro-1", window));
});
