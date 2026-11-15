import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { ArtifactService } from "../../server/agent/services/artifacts";
import { ProposalService } from "../../server/agent/services/proposals";
import { ScheduleValidatorImpl } from "../../server/agent/services/validator";
import type { AgentRepository, GenerationArtifacts } from "../../server/agent/ports";
import type { CheckIn, ConversationMessage, OperationalContext, ScheduleSnapshot, SensorReading } from "../../server/agent/contracts";

const fixture = JSON.parse(readFileSync("docs/agent/examples/normal.json", "utf8"));
const identity = { userId: "user-1", role: "ASTRONAUT" as const, astronautId: "astro-1" };

function setup(allowProposals = false) {
  const checkIn: CheckIn = structuredClone(fixture.confirmedCheckIn);
  checkIn.sharedObservationIds = ["obs-hours"];
  const messages: ConversationMessage[] = [{ id: "message-1", sessionId: checkIn.sessionId, role: "ASTRONAUT", text: "Test privato", createdAt: checkIn.createdAt, inputMode: "TEXT" }];
  let published: GenerationArtifacts | undefined;
  let received: OperationalContext | undefined;
  let failed = false;
  let badEvidence = false;
  let proposed = false;
  const repository = {
    async getCheckIn(astronautId: string) { return astronautId === checkIn.astronautId ? checkIn : null; },
    async claimGeneration() { return { checkInId: checkIn.id, token: "claim-1", leaseExpiresAt: "2099-01-01T00:00:00Z" }; },
    async getSessionState() { return { session: fixture.session, messages }; },
    async completeGeneration(_claim: unknown, artifacts: GenerationArtifacts) { published = artifacts; },
    async failGeneration() { failed = true; },
  } as unknown as AgentRepository;
  const service = new ArtifactService({
    repository,
    allowProposals,
    sensors: { async read() { return fixture.sensors as SensorReading[]; } },
    schedule: { async getDay() { return fixture.schedule as ScheduleSnapshot; } },
    proposals: new ProposalService(new ScheduleValidatorImpl()),
    operationalAi: { async generateOperational({ context }) {
      received = context;
      return {
        report: { findings: [{ text: "Sonno riferito", source: "self_report", evidence: [{ source: "self_report", observationId: badEvidence ? "obs-fatigue" : "obs-hours" }] }], discrepancies: [], uncertainties: [], humanReview: { required: false, reason: null } },
        proposal: proposed ? fixture.pendingProposal.candidate : null,
        noChangeReason: proposed ? null : "Nessuna variazione proposta.",
      };
    } },
    diaryAi: { async generateDiary(input) {
      assert.equal(input.messages[0].text, "Test privato");
      return { text: "Diario personale" };
    } },
  });
  return { service, checkIn, published: () => published, received: () => received, failed: () => failed, makeEvidenceInvalid: () => { badEvidence = true; }, makeProposal: () => { proposed = true; } };
}

test("operational AI receives only explicitly shared observations; diary stays private", async () => {
  const h = setup();
  await h.service.generate(identity, h.checkIn.id);
  assert.deepEqual(h.received()?.checkIn.observations.map((o) => o.id), ["obs-hours"]);
  assert.ok(!JSON.stringify(h.received()).includes("messageIds"));
  assert.ok(!JSON.stringify(h.received()).includes("Test privato"));
  assert.equal(h.published()?.diary.visibility, "PRIVATE");
  assert.equal(h.published()?.proposal, null);
});

test("unshared evidence is excluded and the report requires human review", async () => {
  const h = setup();
  h.makeEvidenceInvalid();
  await h.service.generate(identity, h.checkIn.id);
  assert.deepEqual(h.published()?.report.findings, []);
  assert.equal(h.published()?.report.humanReview.required, true);
  assert.ok(h.published()?.report.uncertainties.some((item) => item.includes("escluse")));
});

test("ground control cannot generate an astronaut's private diary", async () => {
  const h = setup();
  await assert.rejects(h.service.generate({ userId: "ground-1", role: "GROUND_CONTROL", astronautIds: ["astro-1"] }, h.checkIn.id));
  assert.equal(h.published(), undefined);
});

test("a model cannot publish a proposal before an authoritative schedule is connected", async () => {
  const h = setup();
  h.makeProposal();
  await assert.rejects(h.service.generate(identity, h.checkIn.id));
  assert.equal(h.published(), undefined);
  assert.equal(h.failed(), true);
});

test("an invalid recommendation is discarded while the valid report remains available for ground review", async () => {
  const h = setup(true);
  h.makeProposal(); // The candidate cites observations that were not shared.
  await h.service.generate(identity, h.checkIn.id);
  assert.equal(h.failed(), false);
  assert.equal(h.published()?.proposal, null);
  assert.ok(h.published()?.noChangeReason);
  assert.equal(h.published()?.report.humanReview.required, true);
  assert.equal(h.published()?.diary.visibility, "PRIVATE");
});
