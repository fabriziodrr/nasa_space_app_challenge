import assert from "node:assert/strict";
import { test } from "node:test";
import { createTestDb } from "./helpers/db";
import { demoProgram, DemoProgramProvider } from "../../server/agent/adapters/demo-program";
import { SimulatedScheduleProvider } from "../../server/agent/adapters/schedule";
import { sharedResourceConflicts } from "../../server/agent/lib/shared-resources";

test("exclusive resources conflict across overlapping crew schedules", () => {
  const a = demoProgram("astro-1", "2026-11-14");
  const b = demoProgram("crew-demo-02", "2026-11-14");
  a.activities[3].sharedResources = ["lab-terminal"];
  b.activities[3].sharedResources = ["lab-terminal"];
  assert.deepEqual(sharedResourceConflicts(a, [b]), ["lab-terminal"]);
  b.activities[3].startsAt = a.activities[3].endsAt;
  b.activities[3].endsAt = "2026-11-14T10:20:00Z";
  assert.deepEqual(sharedResourceConflicts(a, [b]), []);
  b.activities[3].startsAt = "2026-11-14T09:20:00Z";
  b.activities[3].sharedResources = ["other-terminal"];
  assert.deepEqual(sharedResourceConflicts(a, [b]), []);
});

test("save and apply recheck shared resources against current peer schedules", async () => {
  const db = createTestDb();
  try {
    const provider = new DemoProgramProvider(db.prisma);
    const a = await provider.getDay("astro-1", "2026-11-14");
    const b = await provider.getDay("crew-demo-02", "2026-11-14");
    a.activities[3].sharedResources = ["lab-terminal"];
    await provider.replaceDay("astro-1", a.version, a);
    b.activities[3].sharedResources = ["lab-terminal"];
    await assert.rejects(provider.replaceDay("crew-demo-02", b.version, b), /Shared resource conflict/);
    b.activities[3].startsAt = "2026-11-14T10:00:00.000Z";
    b.activities[3].endsAt = "2026-11-14T10:40:00.000Z";
    await provider.replaceDay("crew-demo-02", b.version, b);
    const current = await provider.getDay("astro-1", "2026-11-14");
    const result = await new SimulatedScheduleProvider(db.prisma).applyApproved({ astronautId: "astro-1", scheduleId: current.id,
      proposalId: "proposal-test", decisionId: "decision-test", expectedScheduleVersion: current.version, changes: [
        { type: "MOVE_ACTIVITY", activityId: "science-1", startsAt: "2026-11-14T09:40:00.000Z", endsAt: "2026-11-14T10:20:00.000Z" },
      ] });
    assert.equal(result.outcome, "FAILED");
    if (result.outcome === "FAILED") assert.match(result.reason, /lab-terminal/);
    assert.equal((await provider.getDay("astro-1", "2026-11-14")).version, current.version);
  } finally { await db.cleanup(); }
});
