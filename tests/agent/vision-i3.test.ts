import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ArtifactService } from "../../server/agent/services/artifacts";
import { ProposalService } from "../../server/agent/services/proposals";
import { ScheduleValidatorImpl } from "../../server/agent/services/validator";
import { MockConversationAiProvider } from "../../server/agent/adapters/mock-conversation-ai";
import type { AgentRepository, GenerationArtifacts } from "../../server/agent/ports";
import type { VisionConfirmationService } from "../../server/agent/vision/confirmation";
import type { VisionObservation } from "../../server/agent/contracts";
import { createArtifactHttpHandlers } from "../../server/agent/http/artifact-handlers";
import type { AgentRuntime } from "../../server/agent/runtime";

const fixture = JSON.parse(readFileSync("docs/agent/examples/normal.json", "utf8"));
const actor = { userId: "u1", role: "ASTRONAUT" as const, astronautId: "astro-1" };
const vision: VisionObservation = { schemaVersion: "vision-observation-1", id: "vision-1", astronautId: "astro-1",
  sessionId: fixture.confirmedCheckIn.sessionId, source: "webcam", exportSchemaVersion: "crewready-session-v2",
  exportContractVersion: "c01-v2", engineVersion: "n02-engine-v1", configId: "cfg", calibrationIds: ["cal"],
  sha256: "a".repeat(64), startedAt: "2026-11-14T05:00:00Z", endedAt: "2026-11-14T05:01:00Z",
  exportedAt: "2026-11-14T05:01:01Z", importedAt: "2026-11-14T05:02:00Z", elapsedMs: 60000,
  validMs: 54000, coverage: 0.9, closureFraction: 0.1, completeCount: 2, incompleteCount: 0,
  prolongedCount: 1, longestCompleteMs: 600, interruption: "user_stop", usability: "USABLE", reasons: [] };

function setup(selected: VisionObservation | null, requestedId?: string) {
  let saved: GenerationArtifacts | undefined; let received: unknown;
  const checkIn = { ...fixture.confirmedCheckIn, sharedObservationIds: ["obs-hours"] };
  const repo = { async getCheckIn() { return checkIn; }, async claimGeneration() { return { checkInId: checkIn.id, token: "t1", leaseExpiresAt: "2099-01-01T00:00:00Z" }; },
    async getSessionState() { return { session: fixture.session, messages: [] }; },
    async completeGeneration(_claim: unknown, result: GenerationArtifacts) { saved = result; }, async failGeneration() {} } as unknown as AgentRepository;
  const mock = new MockConversationAiProvider();
  const service = new ArtifactService({ repository: repo, sensors: { async read() { throw new Error("live sensors must not be read"); } },
    frozenContext: { async getFrozenContext() { return { sensors: fixture.sensors, vision: selected }; } } as unknown as VisionConfirmationService,
    schedule: { async getDay() { return fixture.schedule; } }, proposals: new ProposalService(new ScheduleValidatorImpl()),
    operationalAi: { async generateOperational(input) {
      received = input.context;
      if (!requestedId) return mock.generateOperational(input);
      return { report: { findings: [{ text: "Osservazione", source: "vision" as const,
        evidence: [{ source: "vision" as const, visionObservationId: requestedId }] }], discrepancies: [], uncertainties: [], humanReview: { required: false, reason: null } },
        proposal: null, noChangeReason: "Nessuna modifica." };
    } }, diaryAi: { async generateDiary() { return { text: "Privato" }; } } });
  return { service, checkIn, saved: () => saved, received: () => received };
}

test("shared usable vision appears in frozen report, without private metadata", async () => {
  const h = setup(vision); await h.service.generate(actor, h.checkIn.id);
  const finding = h.saved()?.report.findings.find((item) => item.source === "vision");
  assert.deepEqual(finding?.evidence, [{ source: "vision", visionObservationId: "vision-1" }]);
  assert.match(finding!.text, /copertura/); assert.ok(!JSON.stringify(h.received()).includes(vision.sha256));
  assert.ok(!JSON.stringify(h.received()).includes("messageIds"));
});

test("unshared, different and insufficient vision references cannot be published", async () => {
  for (const [item, id] of [[null, "vision-1"], [vision, "other"], [{ ...vision, usability: "INSUFFICIENT", reasons: ["STALE"] }, "vision-1"],
    [{ ...vision, source: "synthetic", startedAt: null, endedAt: null, usability: "INSUFFICIENT", reasons: ["SYNTHETIC_TIME_UNAVAILABLE"] }, "vision-1"]] as [VisionObservation | null, string][]) {
    const h = setup(item, id); await assert.rejects(h.service.generate(actor, h.checkIn.id)); assert.equal(h.saved(), undefined);
  }
});

test("insufficient or synthetic observations produce an uncertainty without evidence", async () => {
  const h = setup({ ...vision, source: "synthetic", startedAt: null, endedAt: null, usability: "INSUFFICIENT", reasons: ["SYNTHETIC_TIME_UNAVAILABLE"] });
  await h.service.generate(actor, h.checkIn.id);
  assert.ok(h.saved()?.report.uncertainties.some((item) => item.includes("sintetica")));
  assert.ok(!h.saved()?.report.findings.some((item) => item.source === "vision"));
});

test("schedule proposals only accept the frozen usable vision ID", () => {
  const checkIn = { ...fixture.confirmedCheckIn, observations: [], sharedObservationIds: [] };
  const shared = { id: checkIn.id, astronautId: checkIn.astronautId, confirmedAt: checkIn.confirmedAt, observations: [] };
  const context = { checkIn: shared, sensors: fixture.sensors, vision };
  const candidate = { ...fixture.pendingProposal.candidate, evidence: [{ source: "vision" as const, visionObservationId: vision.id }] };
  const validator = new ScheduleValidatorImpl();
  assert.equal(validator.validate({ schedule: fixture.schedule, context, candidate }).valid, true);
  assert.equal(validator.validate({ schedule: fixture.schedule, context: { ...context, vision: null }, candidate }).valid, false);
  assert.equal(validator.validate({ schedule: fixture.schedule, context: { ...context, vision: { ...vision, usability: "INSUFFICIENT" } }, candidate }).valid, false);
});

test("v1 does not expose new vision evidence while v2 returns it with version 2", async () => {
  const h = setup(vision); await h.service.generate(actor, h.checkIn.id);
  const identity = { async authenticate() { return actor; } };
  const repository = { async listReports() { return { items: [h.saved()!.report], nextCursor: null }; } };
  const handlers = createArtifactHttpHandlers(() => ({ identity, repository } as unknown as AgentRuntime));
  const request = () => new Request("http://localhost/api/agent/reports?astronautId=astro-1");
  assert.equal((await handlers.reports(request())).status, 409);
  const result = await handlers.reportsV2(request());
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal(body.meta.contractVersion, "2.0.0");
  assert.ok(body.data.items[0].findings.some((item: { source: string }) => item.source === "vision"));
});
