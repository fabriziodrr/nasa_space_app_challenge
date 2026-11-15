import assert from "node:assert/strict";
import { test } from "node:test";
import { createTestDb } from "./helpers/db";
import { PythonSensorProvider } from "../../server/agent/adapters/python-sensors";
import { PrismaAgentRepository } from "../../server/agent/adapters/prisma/repository";
import { DemoProgramProvider } from "../../server/agent/adapters/demo-program";
import { VisionConfirmationService } from "../../server/agent/vision/confirmation";
import { DEFAULT_VISION_QUALITY } from "../../server/agent/vision/quality";
import { ArtifactService } from "../../server/agent/services/artifacts";
import { ProposalService } from "../../server/agent/services/proposals";
import { DemoScheduleValidator } from "../../server/agent/services/demo-validator";
import { MockConversationAiProvider } from "../../server/agent/adapters/mock-conversation-ai";

test("confirmed Python context is frozen and later used by the ground report", async () => {
  const db = createTestDb();
  const now = new Date("2026-11-15T06:00:00Z"); let sleepHours = 5.5; let calls = 0; let offline = false;
  const sensors = new PythonSensorProvider({ subjectId: "sleep-demo-14d", fetch: async () => {
    calls++;
    if (offline) throw new Error("backend unavailable");
    return Response.json({ subject_id: "sleep-demo-14d", synthetic: true, snapshot_id: "snap-1", as_of: "2026-11-15T05:00:00Z", truncated: false,
      sleep_context: { latest_measurement: { observation_id: "night-1", subject_id: "sleep-demo-14d", synthetic: true,
        quality: "valid", source: "instrument", observed_at: "2026-11-15T05:00:00Z", period_start: "2026-11-14T20:00:00Z",
        period_end: "2026-11-15T04:00:00Z", device_id: "watch", method: "demo", sleep_hours: sleepHours, awakenings_count: null,
        sleep_stages: { device_id: "eeg", method: "simulated_eeg", rem_minutes: 78 },
        heart_rate_variability: { device_id: "ecg", method: "simulated_rmssd", value_ms: 42, aggregation: "nightly" } } } });
  } });
  try {
    const repository = new PrismaAgentRepository(db.prisma);
    const schedule = new DemoProgramProvider(db.prisma, () => now);
    await db.prisma.conversationSession.create({ data: { id: "session-py", astronautId: "astro-1", openedAt: now } });
    const observations = [{ id: "fatigue", source: "self_report", field: "FATIGUE", value: 8, scaleMax: 10,
      messageIds: ["msg"], recordedAt: now.toISOString() }];
    await db.prisma.checkIn.create({ data: { id: "check-py", astronautId: "astro-1", sessionId: "session-py", revision: 1,
      status: "DRAFT", observationsJson: JSON.stringify(observations), sharedObservationIdsJson: "[]", createdAt: now } });
    const frozen = new VisionConfirmationService(db.prisma, sensors, DEFAULT_VISION_QUALITY, schedule, () => now);
    await frozen.confirm("astro-1", "check-py", { expectedRevision: 1, sharedObservationIds: ["fatigue"],
      vision: { visionObservationId: null, shareWithGround: false } });
    sleepHours = 9;
    const ai = new MockConversationAiProvider({ proposalsEnabled: true });
    const service = new ArtifactService({ repository, sensors, schedule, operationalAi: ai, diaryAi: ai,
      frozenContext: frozen, allowProposals: true, proposals: new ProposalService(new DemoScheduleValidator()) });
    await service.generate({ userId: "astro", role: "ASTRONAUT", astronautId: "astro-1" }, "check-py");
    const context = await frozen.getFrozenContext("astro-1", "check-py");
    assert.equal(context.sensors[0].value, 5.5);
    assert.equal(context.sensors[0].provenance?.snapshotId, "snap-1"); assert.equal(calls, 1);
    const report = (await repository.listReports({ astronautId: "astro-1", limit: 20 })).items[0];
    assert.ok(report.findings.some((finding) => finding.source === "sensor" && finding.text.includes("5.5")));
    assert.ok(report.findings.some((finding) => finding.source === "sensor" && finding.text.includes("REM_DURATION: 78") && finding.text.includes("simulated_eeg")));
    assert.ok(report.findings.some((finding) => finding.source === "sensor" && finding.text.includes("HEART_RATE_VARIABILITY: 42") && finding.text.includes("nightly")));
    assert.ok(report.uncertainties.some((item) => item.includes("synthetic profile linked")));
    offline = true;
    await db.prisma.conversationSession.create({ data: { id: "session-offline", astronautId: "astro-1", openedAt: now } });
    await db.prisma.checkIn.create({ data: { id: "check-offline", astronautId: "astro-1", sessionId: "session-offline", revision: 1,
      status: "DRAFT", observationsJson: "[]", sharedObservationIdsJson: "[]", createdAt: now } });
    await frozen.confirm("astro-1", "check-offline", { expectedRevision: 1, sharedObservationIds: [],
      vision: { visionObservationId: null, shareWithGround: false } });
    await service.generate({ userId: "astro", role: "ASTRONAUT", astronautId: "astro-1" }, "check-offline");
    const offlineReport = (await repository.listReports({ astronautId: "astro-1", limit: 20 })).items.find((item) => item.checkInId === "check-offline")!;
    assert.ok(offlineReport.uncertainties.some((item) => item.includes("UNAVAILABLE")));
    assert.ok(!offlineReport.findings.some((item) => item.source === "sensor"));
  } finally { await db.cleanup(); }
});
