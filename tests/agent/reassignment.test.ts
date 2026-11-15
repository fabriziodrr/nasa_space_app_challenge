import assert from "node:assert/strict";
import { test } from "node:test";
import { createTestDb } from "./helpers/db";
import { DemoProgramProvider } from "../../server/agent/adapters/demo-program";
import { PrismaAgentRepository } from "../../server/agent/adapters/prisma/repository";
import { ApprovalService } from "../../server/agent/services/approval";
import { DemoScheduleValidator } from "../../server/agent/services/demo-validator";
import { ProposalService } from "../../server/agent/services/proposals";
import type { OperationalContext, ProposalCandidate } from "../../server/agent/contracts";
import { MockConversationAiProvider } from "../../server/agent/adapters/mock-conversation-ai";

test("mock agent proposes removal for a shared request and leaves assignment to the scheduler", async () => {
  const date = "2026-11-14T08:00:00Z";
  const context: OperationalContext = { checkIn: { id: "check-request", astronautId: "astro-1", confirmedAt: date, observations: [
    { id: "sleep", source: "self_report", field: "SLEEP_HOURS", value: 4.5, recordedAt: date },
    { id: "fatigue", source: "self_report", field: "FATIGUE", value: 8, scaleMax: 10, recordedAt: date },
    { id: "physical", source: "self_report", field: "PHYSICAL_NOTES", value: "I am tired; please reassign a task.", recordedAt: date },
  ] }, sensors: [] };
  const { demoProgram } = await import("../../server/agent/adapters/demo-program");
  const result = await new MockConversationAiProvider({ proposalsEnabled: true }).generateOperational({ context, schedule: demoProgram("astro-1", "2026-11-14") });
  assert.equal(result.proposal?.changes[0].type, "REMOVE_ACTIVITY");
  if (result.proposal?.changes[0].type === "REMOVE_ACTIVITY") assert.equal(result.proposal.changes[0].reassignment, null);
});

test("removal is proposed, reassigned atomically only on ground approval, and rejects stale recipient", async () => {
  const db = createTestDb();
  try {
    const now = new Date("2026-11-14T08:00:00Z");
    const schedule = new DemoProgramProvider(db.prisma, () => now);
    const repository = new PrismaAgentRepository(db.prisma);
    const approval = new ApprovalService(repository, schedule);
    const source = await schedule.getDay("astro-1", "2026-11-14");
    const task = source.activities.find((item) => item.id === "science-2")!;
    const context: OperationalContext = { checkIn: { id: "check-transfer", astronautId: "astro-1", confirmedAt: now.toISOString(), observations: [
      { id: "fatigue", source: "self_report", field: "FATIGUE", value: 8, scaleMax: 10, recordedAt: now.toISOString() },
    ] }, sensors: [] };
    const initial = { type: "REMOVE_ACTIVITY" as const, activityId: task.id, startsAt: task.startsAt, endsAt: task.endsAt, reassignment: null };
    const planned = await schedule.planReassignment(source, initial);
    assert.equal(planned.reassignment?.astronautId, "crew-demo-02");
    const candidate: ProposalCandidate = { rationale: "Reduce workload", evidence: [{ source: "self_report", observationId: "fatigue" }], changes: [planned] };
    const result = new ProposalService(new DemoScheduleValidator()).build(candidate, context, source);
    assert.equal(result.outcome, "proposal");
    if (result.outcome !== "proposal") return;
    const proposal = result.proposal;
    await db.prisma.scheduleProposal.create({ data: { id: proposal.id, astronautId: proposal.astronautId, checkInId: proposal.checkInId,
      scheduleId: proposal.scheduleId, baseScheduleVersion: proposal.baseScheduleVersion, createdAt: new Date(proposal.createdAt),
      candidateJson: JSON.stringify(proposal.candidate), status: proposal.status } });
    const recipient = await schedule.getDay("crew-demo-02", source.date);
    assert.ok((await schedule.getDay("astro-1", source.date)).activities.some((item) => item.id === task.id));
    await assert.rejects(approval.decide({ identity: { userId: "crew", role: "ASTRONAUT", astronautId: "astro-1" }, proposalId: proposal.id,
      idempotencyKey: "no", request: { decision: "APPROVE", comment: null } }));
    await assert.rejects(approval.decide({ identity: { userId: "ground", role: "GROUND_CONTROL", astronautIds: ["astro-1"] }, proposalId: proposal.id,
      idempotencyKey: "scope", request: { decision: "APPROVE", comment: null } }));
    const identity = { userId: "ground", role: "GROUND_CONTROL" as const, astronautIds: ["astro-1", "crew-demo-02"] };
    const approved = await approval.decide({ identity, proposalId: proposal.id, idempotencyKey: "approve", request: { decision: "APPROVE", comment: null } });
    assert.equal(approved.proposal.status, "APPLIED");
    assert.equal((await schedule.getDay("astro-1", source.date)).activities.some((item) => item.id === task.id), false);
    const updatedRecipient = await schedule.getDay("crew-demo-02", source.date);
    assert.equal(updatedRecipient.version, recipient.version + 1);
    assert.ok(updatedRecipient.activities.some((item) => item.id === planned.reassignment?.activityId));
    await approval.decide({ identity, proposalId: proposal.id, idempotencyKey: "approve", request: { decision: "APPROVE", comment: null } });
    assert.equal((await schedule.getDay("crew-demo-02", source.date)).version, updatedRecipient.version);

    const otherDay = await schedule.getDay("astro-1", "2026-11-15");
    const otherTask = otherDay.activities.find((item) => item.id === "science-2")!;
    const nextChange = await schedule.planReassignment(otherDay, { type: "REMOVE_ACTIVITY", activityId: otherTask.id,
      startsAt: otherTask.startsAt, endsAt: otherTask.endsAt, reassignment: null });
    assert.ok(nextChange.reassignment);
    const next = new ProposalService(new DemoScheduleValidator()).build({ ...candidate, changes: [nextChange] },
      { ...context, checkIn: { ...context.checkIn, id: "check-stale" } }, otherDay);
    assert.equal(next.outcome, "proposal");
    if (next.outcome !== "proposal") return;
    await db.prisma.scheduleProposal.create({ data: { id: next.proposal.id, astronautId: next.proposal.astronautId, checkInId: next.proposal.checkInId,
      scheduleId: next.proposal.scheduleId, baseScheduleVersion: next.proposal.baseScheduleVersion, createdAt: new Date(next.proposal.createdAt),
      candidateJson: JSON.stringify(next.proposal.candidate), status: next.proposal.status } });
    const recipientNext = await schedule.getDay("crew-demo-02", otherDay.date);
    await schedule.replaceDay("crew-demo-02", recipientNext.version, recipientNext);
    const stale = await approval.decide({ identity, proposalId: next.proposal.id, idempotencyKey: "stale", request: { decision: "APPROVE", comment: null } });
    assert.equal(stale.proposal.status, "APPLY_FAILED");
    assert.ok((await schedule.getDay("astro-1", otherDay.date)).activities.some((item) => item.id === otherTask.id));
    assert.equal((await schedule.getDay("crew-demo-02", otherDay.date)).version, recipientNext.version + 1);

    const noEligible = structuredClone(otherDay);
    noEligible.activities.find((item) => item.id === "science-2")!.eligibleAstronautIds = [];
    assert.equal((await schedule.planReassignment(noEligible, { ...nextChange, reassignment: null })).reassignment, null);
  } finally { await db.cleanup(); }
});
