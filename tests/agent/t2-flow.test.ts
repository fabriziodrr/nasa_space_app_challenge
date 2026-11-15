import assert from "node:assert/strict";
import { test } from "node:test";
import { createTestDb } from "./helpers/db";
import { PrismaAgentRepository } from "../../server/agent/adapters/prisma/repository";
import { DemoIdentityProvider } from "../../server/agent/adapters/demo-identity";
import { MockConversationAiProvider } from "../../server/agent/adapters/mock-conversation-ai";
import { createDemoContextProviders } from "../../server/agent/adapters/demo-context";
import { createConversationService } from "../../server/agent/core/conversation-service";
import { CheckInService } from "../../server/agent/services/checkin";
import { ArtifactService } from "../../server/agent/services/artifacts";
import { ProposalService } from "../../server/agent/services/proposals";
import { ScheduleValidatorImpl } from "../../server/agent/services/validator";
import { createArtifactHttpHandlers } from "../../server/agent/http/artifact-handlers";
import type { AgentRuntime } from "../../server/agent/runtime";

test("confirmed shared observations produce a ground report and a private editable diary", async () => {
  const db = createTestDb();
  try {
    const repository = new PrismaAgentRepository(db.prisma);
    const context = createDemoContextProviders("RESTED");
    const ai = new MockConversationAiProvider();
    const identity = { userId: "astronaut", role: "ASTRONAUT" as const, astronautId: "astro-1" };
    const service = createConversationService({ ai, repository, ...context });
    const session = await service.createSession(identity, { astronautId: "astro-1" });
    const turn = await service.sendMessage(identity, session.id, {
      clientMessageId: "message-1", text: "I slept 5 hours. Fatigue 4 out of 10.", inputMode: "TEXT",
    });
    const hours = turn.checkIn.observations.find((o) => o.field === "SLEEP_HOURS")!;
    const artifacts = new ArtifactService({ repository, ...context, operationalAi: ai, diaryAi: ai, proposals: new ProposalService(new ScheduleValidatorImpl()) });
    const runtime = { repository, service, artifacts, checkIns: new CheckInService(repository), identity: new DemoIdentityProvider("astronaut-token-123456", "ground-token-123456789") } as AgentRuntime;
    const handlers = createArtifactHttpHandlers(() => runtime);
    const req = (path: string, token: string, method = "GET", body?: unknown) => new Request(`http://localhost/api/agent/v1${path}`, {
      method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const invalidUpdate = await handlers.updateCheckIn(req("/check-in", "astronaut-token-123456", "PATCH", {
      expectedRevision: turn.checkIn.revision, observations: [{ ...hours, messageIds: ["other-session-message"] }],
    }), turn.checkIn.id);
    assert.equal(invalidUpdate.status, 409);
    const updatedCheckIn = await handlers.updateCheckIn(req("/check-in", "astronaut-token-123456", "PATCH", {
      expectedRevision: turn.checkIn.revision, observations: turn.checkIn.observations,
    }), turn.checkIn.id);
    assert.equal(updatedCheckIn.status, 200);
    const revision = (await updatedCheckIn.json()).data.revision;
    const confirmed = await handlers.confirm(req("/confirm", "astronaut-token-123456", "POST", {
      expectedRevision: revision, sharedObservationIds: [hours.id],
    }), turn.checkIn.id);
    assert.equal(confirmed.status, 202);
    let state = await repository.getSessionState("astro-1", session.id);
    for (let i = 0; i < 100 && state?.generationStatus !== "READY" && state?.generationStatus !== "FAILED"; i++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      state = await repository.getSessionState("astro-1", session.id);
    }
    assert.equal(state?.generationStatus, "READY");
    const reportResponse = await handlers.reports(req("/reports?astronautId=astro-1", "ground-token-123456789"));
    assert.equal(reportResponse.status, 200);
    const report = (await reportResponse.json()).data.items[0];
    const sharedFindings = report.findings.filter((finding: { source: string }) => finding.source === "self_report");
    assert.equal(sharedFindings.length, 1);
    assert.equal(sharedFindings[0].evidence[0].observationId, hours.id);
    assert.ok(report.findings.some((finding: { source: string }) => finding.source === "sensor"));
    assert.ok(!JSON.stringify(report).includes("Fatigue"));
    assert.equal((await handlers.diary(req("/diary?astronautId=astro-1", "ground-token-123456789"))).status, 403);
    const diaryResponse = await handlers.diary(req("/diary?astronautId=astro-1", "astronaut-token-123456"));
    const diary = (await diaryResponse.json()).data.items[0];
    assert.match(diary.text, /Fatigue/);
    const edited = await handlers.updateDiary(req("/diary/1", "astronaut-token-123456", "PATCH", {
      expectedRevision: diary.revision, text: "Diario corretto.", status: "CONFIRMED",
    }), diary.id);
    assert.equal(edited.status, 200);
    assert.equal((await edited.json()).data.text, "Diario corretto.");
    const conflict = await handlers.updateDiary(req("/diary/1", "astronaut-token-123456", "PATCH", {
      expectedRevision: diary.revision, text: "Modifica obsoleta.", status: "DRAFT",
    }), diary.id);
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json()).error.currentVersion, diary.revision + 1);
  } finally { await db.cleanup(); }
});

test("failed generation can be retried immediately without duplicating artifacts", async () => {
  const db = createTestDb();
  try {
    const repository = new PrismaAgentRepository(db.prisma);
    const context = createDemoContextProviders("RESTED");
    const ai = new MockConversationAiProvider();
    const identity = { userId: "astronaut", role: "ASTRONAUT" as const, astronautId: "astro-1" };
    const service = createConversationService({ ai, repository, ...context });
    const session = await service.createSession(identity, { astronautId: "astro-1" });
    const turn = await service.sendMessage(identity, session.id, { clientMessageId: "message-2", text: "I slept 5 hours.", inputMode: "TEXT" });
    await new CheckInService(repository).confirm(identity, turn.checkIn.id, { expectedRevision: turn.checkIn.revision, sharedObservationIds: [turn.checkIn.observations[0].id] });
    let calls = 0;
    const artifacts = new ArtifactService({
      repository, ...context, diaryAi: ai, proposals: new ProposalService(new ScheduleValidatorImpl()),
      operationalAi: { async generateOperational(input) { if (++calls === 1) throw new Error("simulated failure"); return ai.generateOperational(input); } },
    });
    await assert.rejects(artifacts.generate(identity, turn.checkIn.id));
    assert.equal((await repository.getSessionState("astro-1", session.id))?.generationStatus, "FAILED");
    await artifacts.generate(identity, turn.checkIn.id);
    await artifacts.generate(identity, turn.checkIn.id);
    assert.equal((await repository.getSessionState("astro-1", session.id))?.generationStatus, "READY");
    assert.equal((await repository.listReports({ astronautId: "astro-1", limit: 20 })).items.length, 1);
    assert.equal((await repository.listDiary("astro-1")).items.length, 1);
    assert.equal(calls, 2);
  } finally { await db.cleanup(); }
});
