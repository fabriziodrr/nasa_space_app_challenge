import assert from "node:assert/strict";
import { test } from "node:test";
import { DemoIdentityProvider } from "../../server/agent/adapters/demo-identity";
import { PythonSensorProvider } from "../../server/agent/adapters/python-sensors";

test("demo credentials bind astronauts individually and ground sees configured crew", async () => {
  const auth = new DemoIdentityProvider("astronaut-token-0001", "ground-token-000001", { AGENT_CREW_02_TOKEN: "astronaut-token-0002" });
  const identity = await auth.authenticate({ authorizationHeader: "Bearer astronaut-token-0002", sessionCookie: null });
  assert.deepEqual(identity, { userId: "demo-crew-demo-02", role: "ASTRONAUT", astronautId: "crew-demo-02" });
  const ground = await auth.authenticate({ authorizationHeader: "Bearer ground-token-000001", sessionCookie: null });
  assert.equal(ground?.role, "GROUND_CONTROL");
  if (ground?.role === "GROUND_CONTROL") assert.deepEqual(ground.astronautIds, ["astro-1", "crew-demo-02"]);
  assert.throws(() => new DemoIdentityProvider("astronaut-token-0001", "ground-token-000001", { AGENT_CREW_02_TOKEN: "astronaut-token-0001" }));
});

test("sensor provider selects only the subject bound to the astronaut", async () => {
  const provider = new PythonSensorProvider({ subjectId: "sleep-demo-14d", fetch: async (url) => {
    assert.match(String(url), /subjects\/crew-demo-02\/agent-context/);
    return Response.json({ subject_id: "sleep-demo-14d", synthetic: true, snapshot_id: "snap", as_of: null, truncated: false, sleep_context: { latest_measurement: null } });
  } });
  const readings = await provider.read("crew-demo-02", { from: "2026-11-14T00:00:00Z", to: "2026-11-15T00:00:00Z" });
  assert.equal(readings[0].provenance?.status, "INVALID");
  assert.equal(readings[0].value, null);
});
