import assert from "node:assert/strict";
import { test } from "node:test";
import { createTestDb } from "./helpers/db";
import { PrismaAgentRepository } from "../../server/agent/adapters/prisma/repository";
import { DemoProgramProvider } from "../../server/agent/adapters/demo-program";
import { MockConversationAiProvider } from "../../server/agent/adapters/mock-conversation-ai";
import { MockVisionReader } from "../../server/agent/adapters/mock-vision-reader";
import { PythonSensorProvider } from "../../server/agent/adapters/python-sensors";
import { VisionService } from "../../server/agent/vision/service";
import { VisionConfirmationService } from "../../server/agent/vision/confirmation";
import { DEFAULT_VISION_QUALITY } from "../../server/agent/vision/quality";
import { ArtifactService } from "../../server/agent/services/artifacts";
import { ProposalService } from "../../server/agent/services/proposals";
import { DemoScheduleValidator } from "../../server/agent/services/demo-validator";

test("one confirmed check-in produces a shared report with voice, synthetic sensor and selected vision", async () => {
  const db = createTestDb();
  const now = new Date("2026-11-15T08:00:00Z");
  const subject = "sleep-demo-14d";
  let reads = 0;
  const sensors = new PythonSensorProvider({ subjectId: subject, fetch: async () => {
    reads++;
    return Response.json({ subject_id: subject, synthetic: true, snapshot_id: "snapshot-unified", as_of: now.toISOString(), truncated: false,
      sleep_context: { latest_measurement: { observation_id: "night-unified", subject_id: subject, synthetic: true,
        quality: "valid", source: "instrument", observed_at: "2026-11-15T07:00:00Z", period_start: "2026-11-14T23:00:00Z",
        period_end: "2026-11-15T07:00:00Z", device_id: "demo-watch", method: "simulated_actigraphy", sleep_hours: 6.2 } } });
  } });
  try {
    const { prisma } = db;
    await prisma.conversationSession.create({ data: { id: "session-unified", astronautId: "astro-1", openedAt: now } });
    await prisma.conversationMessage.create({ data: { id: "voice-unified", sessionId: "session-unified", role: "ASTRONAUT",
      text: "Fatigue 8 out of 10.", createdAt: now, inputMode: "VOICE" } });
    const observations = [{ id: "fatigue-unified", source: "self_report", field: "FATIGUE", value: 8,
      scaleMax: 10, messageIds: ["voice-unified"], recordedAt: now.toISOString() }];
    await prisma.checkIn.create({ data: { id: "check-unified", astronautId: "astro-1", sessionId: "session-unified", revision: 1,
      status: "DRAFT", observationsJson: JSON.stringify(observations), sharedObservationIdsJson: "[]", createdAt: now } });
    const sample = await new MockVisionReader("POOR_SLEEP", () => now).getSelectedForSession("astro-1", "session-unified");
    assert.ok(sample);
    const eye = { ...sample, source: "webcam" as const, startedAt: new Date(now.getTime() - 60000).toISOString(),
      endedAt: now.toISOString(), usability: "USABLE" as const, reasons: [] };
    await prisma.visionObservation.create({ data: { id: eye.id, astronautId: "astro-1", sessionId: "session-unified",
      requestKey: "request-unified", sha256: eye.sha256, summaryJson: JSON.stringify(eye), importedAt: now } });
    const vision = new VisionService(prisma, DEFAULT_VISION_QUALITY);
    await vision.select("astro-1", "session-unified", eye.id);
    const schedule = new DemoProgramProvider(prisma, () => now);
    const frozen = new VisionConfirmationService(prisma, sensors, DEFAULT_VISION_QUALITY, schedule, () => now);
    await frozen.confirm("astro-1", "check-unified", { expectedRevision: 1, sharedObservationIds: ["fatigue-unified"],
      vision: { visionObservationId: eye.id, shareWithGround: true } });
    const repository = new PrismaAgentRepository(prisma);
    const ai = new MockConversationAiProvider();
    await new ArtifactService({ repository, sensors, schedule, operationalAi: ai, diaryAi: ai, frozenContext: frozen,
      proposals: new ProposalService(new DemoScheduleValidator()) }).generate(
      { userId: "astronaut", role: "ASTRONAUT", astronautId: "astro-1" }, "check-unified");
    const report = (await repository.listReports({ astronautId: "astro-1", limit: 20 })).items[0];
    assert.equal(report.checkInId, "check-unified");
    assert.ok(report.findings.some((item) => item.source === "self_report" && item.text.includes("8")));
    assert.ok(report.findings.some((item) => item.source === "sensor" && item.text.includes("6.2")));
    assert.ok(report.findings.some((item) => item.source === "vision"));
    const combined = report.findings.find((item) => item.text.startsWith("Cross-source context:"));
    assert.ok(combined);
    assert.deepEqual(new Set(combined.evidence.map((item) => item.source)), new Set(["self_report", "sensor", "vision"]));
    assert.match(combined.text, /does not establish/);
    assert.equal(reads, 1, "the report must use the frozen sensor snapshot");
    assert.ok(!JSON.stringify(report).includes("voice-unified"), "private message identifiers must not be shared");
  } finally { await db.cleanup(); }
});
