import assert from "node:assert/strict";
import test from "node:test";
import { demoCrew } from "../../server/examples/crew_profiles";
import original from "../../server/examples/nasa_sensor_demo.json";

test("each fictional crew profile has its own synthetic sleep observation", () => {
  assert.equal(demoCrew.length, 5);
  assert.equal(new Set(demoCrew.map((profile) => profile.id)).size, 5);
  assert.equal(new Set(demoCrew.map((profile) => profile.sleep.observation_id)).size, 5);
  assert.deepEqual(demoCrew[0].sleep, original[0]);
  for (const profile of demoCrew) {
    const sleep = profile.sleep;
    assert.equal(sleep.subject_id, profile.id);
    assert.equal(sleep.synthetic, true);
    assert.ok(sleep.sleep_stages.rem_minutes <= sleep.sleep_hours * 60);
    assert.ok(sleep.sleep_hours <= (Date.parse(sleep.period_end) - Date.parse(sleep.period_start)) / 3600000);
  }
});
