import assert from "node:assert/strict";
import { test } from "node:test";
import { createTestDb } from "./helpers/db";
import { TemporalEngine } from "../../server/agent/vision/vendor/analysis/engine";
import { createSessionExport } from "../../server/agent/vision/vendor/integration/session-export";
import { VisionService } from "../../server/agent/vision/service";
import { VisionConfirmationService } from "../../server/agent/vision/confirmation";
import { DEFAULT_VISION_QUALITY } from "../../server/agent/vision/quality";
import { createDemoContextProviders } from "../../server/agent/adapters/demo-context";
import type { ReplayFixture } from "../../server/agent/vision/vendor/contracts/replay";
import { createVisionHttpHandlers } from "../../server/agent/http/vision-handlers";
import type { AgentRuntime } from "../../server/agent/runtime";
import { MockVisionReader } from "../../server/agent/adapters/mock-vision-reader";
import { MockConversationAiProvider } from "../../server/agent/adapters/mock-conversation-ai";
import { PrismaAgentRepository } from "../../server/agent/adapters/prisma/repository";
import { ArtifactService } from "../../server/agent/services/artifacts";
import { ProposalService } from "../../server/agent/services/proposals";
import { ScheduleValidatorImpl } from "../../server/agent/services/validator";

function sampleExport() {
  const fixture: ReplayFixture = { fixtureVersion: "n02-fixture-v1", name: "test", description: "test", config: {}, expected: {}, samples: [
    { timestampMs: 0, calibrationId: "cal", left: { validity: "valid", openness: 1 }, right: { validity: "valid", openness: 1 } },
    { timestampMs: 100, calibrationId: "cal", left: { validity: "valid", openness: 1 }, right: { validity: "valid", openness: 1 } },
  ] };
  const engine = new TemporalEngine(fixture.config); engine.start();
  for (const sample of fixture.samples) engine.processSample(sample);
  return JSON.stringify(createSessionExport({ source: "synthetic", fixture, samples: fixture.samples, snapshot: engine.getSnapshot() }, new Date().toISOString()));
}

test("import, idempotency, selection and snapshot confirmation use scoped persistent records", async () => {
  const db = createTestDb();
  try {
    const { prisma } = db; const now = new Date();
    await prisma.conversationSession.create({ data: { id: "s1", astronautId: "a1", openedAt: now } });
    await prisma.checkIn.create({ data: { id: "c1", astronautId: "a1", sessionId: "s1", revision: 1, status: "DRAFT", observationsJson: "[]", sharedObservationIdsJson: "[]", createdAt: now } });
    const vision = new VisionService(prisma, DEFAULT_VISION_QUALITY); const bytes = new TextEncoder().encode(sampleExport());
    const first = await vision.import("a1", "s1", "key1", bytes);
    assert.equal(first.source, "synthetic"); assert.equal(first.usability, "INSUFFICIENT");
    assert.deepEqual(await vision.import("a1", "s1", "key1", bytes), first);
    await assert.rejects(vision.import("a1", "s1", "key1", new TextEncoder().encode("{}")), /altro contenuto/);
    await assert.rejects(vision.list("a2", "s1"), /non trovata/);
    await assert.rejects(vision.select("a2", "s1", first.id), /non trovata/);
    await vision.select("a1", "s1", first.id);
    assert.equal((await vision.getSelectedForSession("a1", "s1"))?.id, first.id);
    const confirmation = new VisionConfirmationService(prisma, createDemoContextProviders("RESTED").sensors, DEFAULT_VISION_QUALITY);
    const request = { expectedRevision: 1, sharedObservationIds: [], vision: { visionObservationId: first.id, shareWithGround: true } };
    const confirmed = await confirmation.confirm("a1", "c1", request);
    assert.equal(confirmed.checkIn.status, "CONFIRMED");
    assert.deepEqual(await confirmation.confirm("a1", "c1", request), confirmed);
    const offline = new VisionConfirmationService(prisma, { async read() { throw new Error("offline"); } }, DEFAULT_VISION_QUALITY);
    assert.deepEqual(await offline.confirm("a1", "c1", request), confirmed);
    assert.equal((await confirmation.getFrozenSensors("a1", "c1")).length, 3);
    const snapshot = await prisma.checkInContextSnapshot.findUniqueOrThrow({ where: { checkInId: "c1" } });
    assert.equal(JSON.parse(snapshot.visionJson!).id, first.id);
    await assert.rejects(vision.select("a1", "s1", null), /conclusa/);
    await assert.rejects(confirmation.confirm("a1", "c1", { ...request, vision: { ...request.vision, shareWithGround: false } }), /diversi/);
  } finally { await db.cleanup(); }
});

test("invalid replay is rejected and private selection is excluded from frozen operational context", async () => {
  const db = createTestDb();
  try {
    const { prisma } = db; const now = new Date();
    await prisma.conversationSession.create({ data: { id: "s2", astronautId: "a1", openedAt: now } });
    await prisma.checkIn.create({ data: { id: "c2", astronautId: "a1", sessionId: "s2", revision: 1, status: "DRAFT", observationsJson: "[]", sharedObservationIdsJson: "[]", createdAt: now } });
    const service = new VisionService(prisma, DEFAULT_VISION_QUALITY);
    const tampered = JSON.parse(sampleExport()); tampered.snapshot.session.validMs = 90000;
    await assert.rejects(service.import("a1", "s2", "bad", new TextEncoder().encode(JSON.stringify(tampered))), /non valido/);
    assert.equal(await prisma.visionObservation.count(), 0);
    const vision = await service.import("a1", "s2", "good", new TextEncoder().encode(sampleExport()));
    await service.select("a1", "s2", vision.id);
    const confirm = new VisionConfirmationService(prisma, createDemoContextProviders("RESTED").sensors, DEFAULT_VISION_QUALITY);
    await confirm.confirm("a1", "c2", { expectedRevision: 1, sharedObservationIds: [], vision: { visionObservationId: vision.id, shareWithGround: false } });
    assert.equal((await prisma.checkInContextSnapshot.findUniqueOrThrow({ where: { checkInId: "c2" } })).visionJson, null);
  } finally { await db.cleanup(); }
});

test("HTTP import checks authentication, media type, session scope and idempotency", async () => {
  const db = createTestDb();
  try {
    await db.prisma.conversationSession.create({ data: { id: "s3", astronautId: "a1", openedAt: new Date() } });
    const visionObservations = new VisionService(db.prisma, DEFAULT_VISION_QUALITY);
    const identity = { async authenticate({ authorizationHeader }: { authorizationHeader: string | null }) {
      if (authorizationHeader === "Bearer astronaut") return { userId: "u1", role: "ASTRONAUT", astronautId: "a1" };
      if (authorizationHeader === "Bearer other") return { userId: "u2", role: "ASTRONAUT", astronautId: "a2" };
      return null;
    } };
    const handlers = createVisionHttpHandlers(() => ({ identity, visionObservations } as unknown as AgentRuntime));
    const request = (auth: string, body = sampleExport(), type = "application/json") => new Request("http://localhost/api/agent/v1/sessions/s3/vision-observations", {
      method: "POST", headers: { Authorization: auth, "Content-Type": type, "Idempotency-Key": "k1" }, body,
    });
    assert.equal((await handlers.import(request(""), "s3")).status, 401);
    assert.equal((await handlers.import(request("Bearer astronaut", "{}", "text/plain"), "s3")).status, 400);
    assert.equal((await handlers.import(request("Bearer other"), "s3")).status, 404);
    const body = sampleExport();
    assert.equal((await handlers.import(request("Bearer astronaut", body), "s3")).status, 201);
    assert.equal((await handlers.import(request("Bearer astronaut", body), "s3")).status, 201);
    assert.equal((await handlers.import(request("Bearer astronaut", "{}"), "s3")).status, 409);
  } finally { await db.cleanup(); }
});

test("concurrent imports with the same key create a single observation", async () => {
  const db = createTestDb();
  try {
    await db.prisma.conversationSession.create({ data: { id: "s4", astronautId: "a1", openedAt: new Date() } });
    const service = new VisionService(db.prisma, DEFAULT_VISION_QUALITY);
    const bytes = new TextEncoder().encode(sampleExport());
    const [a, b] = await Promise.all([service.import("a1", "s4", "key", bytes), service.import("a1", "s4", "key", bytes)]);
    assert.equal(a.id, b.id);
    assert.equal(await db.prisma.visionObservation.count(), 1);
  } finally { await db.cleanup(); }
});

test("historical confirmed check-ins without a snapshot are explicitly unavailable", async () => {
  const db = createTestDb();
  try {
    const now = new Date();
    await db.prisma.conversationSession.create({ data: { id: "legacy-s", astronautId: "a1", openedAt: now } });
    await db.prisma.checkIn.create({ data: { id: "legacy-c", astronautId: "a1", sessionId: "legacy-s", revision: 2,
      status: "CONFIRMED", observationsJson: "[]", sharedObservationIdsJson: "[]", createdAt: now, confirmedAt: now } });
    const service = new VisionConfirmationService(db.prisma, createDemoContextProviders("RESTED").sensors, DEFAULT_VISION_QUALITY);
    await assert.rejects(service.getFrozenSensors("a1", "legacy-c"), /storico non disponibile/);
    await assert.rejects(service.confirm("a1", "legacy-c", { expectedRevision: 1, sharedObservationIds: [],
      vision: { visionObservationId: null, shareWithGround: false } }), /storico non disponibile/);
  } finally { await db.cleanup(); }
});

test("generated report uses the confirmed vision snapshot even if the source row later changes", async () => {
  const db = createTestDb();
  try {
    const now = new Date(); const { prisma } = db;
    await prisma.conversationSession.create({ data: { id: "s-report", astronautId: "a1", openedAt: now } });
    await prisma.checkIn.create({ data: { id: "c-report", astronautId: "a1", sessionId: "s-report", revision: 1,
      status: "DRAFT", observationsJson: "[]", sharedObservationIdsJson: "[]", createdAt: now } });
    const mockVision = await new MockVisionReader("POOR_SLEEP", () => now).getSelectedForSession("a1", "s-report");
    const webcam = { ...mockVision, source: "webcam" as const, startedAt: new Date(now.getTime() - 60000).toISOString(),
      endedAt: now.toISOString(), usability: "USABLE" as const, reasons: [] };
    await prisma.visionObservation.create({ data: { id: webcam.id, astronautId: "a1", sessionId: "s-report", requestKey: "key",
      sha256: webcam.sha256, summaryJson: JSON.stringify(webcam), importedAt: now } });
    const visionService = new VisionService(prisma, DEFAULT_VISION_QUALITY);
    await visionService.select("a1", "s-report", webcam.id);
    const providers = createDemoContextProviders("RESTED");
    const confirmation = new VisionConfirmationService(prisma, providers.sensors, DEFAULT_VISION_QUALITY);
    await confirmation.confirm("a1", "c-report", { expectedRevision: 1, sharedObservationIds: [],
      vision: { visionObservationId: webcam.id, shareWithGround: true } });
    await prisma.visionObservation.update({ where: { id: webcam.id }, data: { summaryJson: "{}" } });
    const ai = new MockConversationAiProvider(); const repository = new PrismaAgentRepository(prisma);
    const service = new ArtifactService({ repository, ...providers, frozenContext: confirmation, operationalAi: ai, diaryAi: ai,
      proposals: new ProposalService(new ScheduleValidatorImpl()) });
    await service.generate({ userId: "u1", role: "ASTRONAUT", astronautId: "a1" }, "c-report");
    const reports = await repository.listReports({ astronautId: "a1", limit: 10 });
    assert.equal(reports.items.length, 1);
    assert.ok(reports.items[0].findings.some((item) => item.evidence.some((ref) => ref.source === "vision" && ref.visionObservationId === webcam.id)));
  } finally { await db.cleanup(); }
});
