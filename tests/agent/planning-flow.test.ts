import assert from "node:assert/strict";
import { test } from "node:test";
import { createTestDb } from "./helpers/db";
import { DemoProgramProvider, demoProgram } from "../../server/agent/adapters/demo-program";
import { createDemoContextProviders } from "../../server/agent/adapters/demo-context";
import { MockConversationAiProvider } from "../../server/agent/adapters/mock-conversation-ai";
import { PrismaAgentRepository } from "../../server/agent/adapters/prisma/repository";
import { VisionConfirmationService } from "../../server/agent/vision/confirmation";
import { DEFAULT_VISION_QUALITY } from "../../server/agent/vision/quality";
import { ArtifactService } from "../../server/agent/services/artifacts";
import { ProposalService } from "../../server/agent/services/proposals";
import { DemoScheduleValidator } from "../../server/agent/services/demo-validator";
import { repairDemoProposal } from "../../server/agent/services/demo-proposal-repair";
import { ApprovalService } from "../../server/agent/services/approval";
import { createProposalHttpHandlers } from "../../server/agent/http/proposal-handlers";
import type { AgentRuntime } from "../../server/agent/runtime";
import type { OperationalContext, ProposalCandidate } from "../../server/agent/contracts";

const now = new Date("2026-11-14T06:00:00Z");
async function setup(kind: "poor" | "rested" | "missing", changeAfterConfirmation = false, approvalTime = now) {
  const db = createTestDb();
  const repository = new PrismaAgentRepository(db.prisma);
  const schedule = new DemoProgramProvider(db.prisma, () => approvalTime);
  const sensors = createDemoContextProviders(kind === "poor" ? "POOR_SLEEP" : "RESTED").sensors;
  const observations = kind === "missing" ? [] : [
    { id: "sleep", field: "SLEEP_HOURS", source: "self_report", value: kind === "poor" ? 4.5 : 8, messageIds: ["m1"], recordedAt: now.toISOString() },
    { id: "fatigue", field: "FATIGUE", source: "self_report", value: kind === "poor" ? 8 : 1, scaleMax: 10, messageIds: ["m1"], recordedAt: now.toISOString() },
  ];
  await db.prisma.conversationSession.create({ data: { id: "session-plan", astronautId: "astro-1", openedAt: now } });
  await db.prisma.checkIn.create({ data: { id: "check-plan", astronautId: "astro-1", sessionId: "session-plan", revision: 1, status: "DRAFT",
    observationsJson: JSON.stringify(observations), sharedObservationIdsJson: "[]", createdAt: now } });
  const frozen = new VisionConfirmationService(db.prisma, sensors, DEFAULT_VISION_QUALITY, schedule, () => now);
  await frozen.confirm("astro-1", "check-plan", { expectedRevision: 1, sharedObservationIds: observations.map((o) => o.id), vision: { visionObservationId: null, shareWithGround: false } });
  if (changeAfterConfirmation) await db.prisma.scheduleSnapshot.updateMany({ data: { version: { increment: 1 } } });
  const ai = new MockConversationAiProvider({ proposalsEnabled: true });
  const artifacts = new ArtifactService({ repository, sensors, schedule, operationalAi: ai, diaryAi: ai, frozenContext: frozen,
    allowProposals: true, proposals: new ProposalService(new DemoScheduleValidator()) });
  await artifacts.generate({ userId: "astro", role: "ASTRONAUT", astronautId: "astro-1" }, "check-plan");
  const approval = new ApprovalService(repository, schedule);
  const identity = { async authenticate({ authorizationHeader }: { authorizationHeader: string | null }) {
    return authorizationHeader === "Bearer ground" ? { userId: "ground", role: "GROUND_CONTROL", astronautIds: ["astro-1"] }
      : authorizationHeader === "Bearer astro" ? { userId: "astro", role: "ASTRONAUT", astronautId: "astro-1" } : null;
  } };
  const handlers = createProposalHttpHandlers(() => ({ repository, schedule, approval, identity } as unknown as AgentRuntime));
  return { ...db, repository, schedule, handlers };
}
const decision = (actor: string, value: "APPROVE" | "REJECT") => new Request("http://localhost/api/agent/v2/proposals/p/decision", {
  method: "POST", headers: { Authorization: `Bearer ${actor}`, "Idempotency-Key": "decision-key", "Content-Type": "application/json" },
  body: JSON.stringify({ decision: value, comment: null }),
});

test("ground updates the shared schedule with a version check and invalidates older proposals", async () => {
  const h = await setup("poor");
  try {
    const before = await h.schedule.getDay("astro-1", "2026-11-14");
    const proposal = (await h.repository.getSessionState("astro-1", "session-plan"))!.proposal!;
    const edited = { ...before, activities: before.activities.map((a) => a.id === "science-1" ? { ...a, title: "Campioni aggiornati" } : a) };
    const request = (actor: string, schedule: typeof before) => new Request("http://localhost/api/agent/v2/schedule", {
      method: "PUT", headers: { Authorization: `Bearer ${actor}`, "Content-Type": "application/json" },
      body: JSON.stringify({ expectedVersion: before.version, schedule }),
    });
    assert.equal((await h.handlers.updateSchedule(request("astro", edited))).status, 403);
    const overlap = { ...edited, activities: edited.activities.map((a) => a.id === "science-2" ? { ...a, startsAt: "2026-11-14T16:00:00Z", endsAt: "2026-11-14T16:40:00Z", earliestStart: "2026-11-14T16:00:00Z", latestEnd: "2026-11-14T17:00:00Z" } : a) };
    assert.equal((await h.handlers.updateSchedule(request("ground", overlap))).status, 400);
    const saved = await h.handlers.updateSchedule(request("ground", edited));
    assert.equal(saved.status, 200); assert.equal((await saved.json()).data.version, 2);
    assert.equal((await h.schedule.getDay("astro-1", "2026-11-14")).activities.find((a) => a.id === "science-1")?.title, "Campioni aggiornati");
    const replay = await h.handlers.updateSchedule(request("ground", edited));
    assert.equal(replay.status, 409); assert.equal((await replay.json()).error.currentVersion, 2);
    assert.equal((await h.handlers.decide(decision("ground", "APPROVE"), proposal.id)).status, 409);
    assert.equal((await h.repository.getProposal("astro-1", proposal.id))!.status, "STALE");
  } finally { await h.cleanup(); }
});

test("concurrent ground updates from the same version cannot both overwrite the shared day", async () => {
  const h = await setup("rested");
  try {
    const schedule = await h.schedule.getDay("astro-1", "2026-11-14");
    const request = (title: string) => new Request("http://localhost/api/agent/v2/schedule", {
      method: "PUT", headers: { Authorization: "Bearer ground", "Content-Type": "application/json" },
      body: JSON.stringify({ expectedVersion: 1, schedule: { ...schedule,
        activities: schedule.activities.map((a) => a.id === "science-1" ? { ...a, title } : a) } }),
    });
    const results = await Promise.all([h.handlers.updateSchedule(request("A")), h.handlers.updateSchedule(request("B"))]);
    assert.deepEqual(results.map((response) => response.status).sort(), [200, 409]);
    const stored = await h.schedule.getDay("astro-1", "2026-11-14");
    assert.equal(stored.version, 2);
    assert.ok(["A", "B"].includes(stored.activities.find((a) => a.id === "science-1")!.title));
  } finally { await h.cleanup(); }
});

test("report proposes a bounded change; astronaut cannot approve; ground applies once", async () => {
  const h = await setup("poor");
  try {
    const state = await h.repository.getSessionState("astro-1", "session-plan");
    const proposal = state!.proposal!; assert.equal(proposal.status, "PENDING_REVIEW");
    const before = await h.schedule.getDay("astro-1", "2026-11-14"); assert.equal(before.version, 1);
    const read = (path: string) => new Request(`http://localhost/api/agent/v2${path}`, { headers: { Authorization: "Bearer ground" } });
    const listed = await h.handlers.list(read("/proposals?astronautId=astro-1"));
    const listedBody = await listed.json();
    assert.equal(listedBody.meta.contractVersion, "2.0.0"); assert.equal(listedBody.data.items[0].id, proposal.id);
    assert.equal(listed.headers.get("cache-control"), "no-store");
    assert.equal((await h.handlers.list(read("/proposals?astronautId=astro-2"))).status, 404);
    assert.equal((await h.handlers.list(read("/proposals?astronautId=astro-1&limit=0"))).status, 400);
    assert.equal((await h.handlers.list(read("/proposals?astronautId=astro-1&astronautId=astro-2"))).status, 400);
    assert.equal((await h.handlers.list(new Request("http://localhost/api/agent/v2/proposals?astronautId=astro-1"))).status, 401);
    const programResponse = await h.handlers.schedule(read("/schedule?astronautId=astro-1&date=2026-11-14"));
    assert.equal((await programResponse.json()).data.id, before.id);
    assert.equal((await h.schedule.applyApproved({ astronautId: "astro-1", scheduleId: proposal.scheduleId,
      proposalId: proposal.id, decisionId: "not-approved", expectedScheduleVersion: 1, changes: proposal.candidate.changes })).outcome, "FAILED");
    assert.equal((await h.handlers.decide(decision("astro", "APPROVE"), proposal.id)).status, 403);
    const first = await h.handlers.decide(decision("ground", "APPROVE"), proposal.id);
    assert.equal(first.status, 200); const body = await first.json(); assert.equal(body.data.proposal.status, "APPLIED");
    const after = await h.schedule.getDay("astro-1", "2026-11-14"); assert.equal(after.version, 2);
    for (const activity of before.activities.filter((a) => !a.movable)) assert.deepEqual(after.activities.find((a) => a.id === activity.id), activity);
    assert.equal((await h.handlers.decide(decision("ground", "APPROVE"), proposal.id)).status, 200);
    assert.equal((await h.schedule.getDay("astro-1", "2026-11-14")).version, 2);
  } finally { await h.cleanup(); }
});

test("demo policy refuses long rests and changes in the past", () => {
  const validator = new DemoScheduleValidator();
  const schedule = demoProgram("astro-1", "2026-11-14");
  const context: OperationalContext = { checkIn: { id: "c1", astronautId: "astro-1", confirmedAt: now.toISOString(), observations: [
    { id: "fatigue", source: "self_report", field: "FATIGUE", value: 8, scaleMax: 10, recordedAt: now.toISOString() },
  ] }, sensors: [] };
  const candidate: ProposalCandidate = { rationale: "Test", evidence: [{ source: "self_report", observationId: "fatigue" }], changes: [
    { type: "MOVE_ACTIVITY", activityId: "science-1", startsAt: "2026-11-14T09:20:00Z", endsAt: "2026-11-14T10:00:00Z" },
    { type: "ADD_REST", activityId: "rest", title: "Pausa", startsAt: "2026-11-14T09:00:00Z", endsAt: "2026-11-14T09:20:00Z" },
  ] };
  assert.equal(validator.validate({ schedule, context, candidate }).valid, true);
  assert.equal(validator.validate({ schedule, context: { ...context, checkIn: { ...context.checkIn,
    observations: [{ id: "fatigue", source: "self_report", field: "FATIGUE", value: 4,
      scaleMax: null, recordedAt: now.toISOString() }] } }, candidate }).valid, false);
  assert.equal(validator.validate({ schedule, context: { ...context, checkIn: { ...context.checkIn, confirmedAt: "2026-11-14T10:00:00Z" } }, candidate }).valid, false);
  const longPause: ProposalCandidate = { ...candidate, changes: [
    { type: "MOVE_ACTIVITY", activityId: "science-1", startsAt: "2026-11-14T09:30:00Z", endsAt: "2026-11-14T10:10:00Z" },
    { type: "ADD_REST", activityId: "rest", title: "Pausa", startsAt: "2026-11-14T09:00:00Z", endsAt: "2026-11-14T09:30:00Z" },
  ] };
  assert.equal(validator.validate({ schedule, context, candidate: longPause }).valid, false);
});

test("demo repair chooses a future flexible activity and validates the result", () => {
  const schedule = demoProgram("astro-1", "2026-11-14");
  const confirmedAt = "2026-11-14T10:00:00.000Z";
  const context: OperationalContext = { checkIn: { id: "c1", astronautId: "astro-1", confirmedAt, observations: [
    { id: "fatigue", source: "self_report", field: "FATIGUE", value: 8, scaleMax: 10, recordedAt: confirmedAt },
  ] }, sensors: [] };
  const candidate: ProposalCandidate = { rationale: "Short rest requested", evidence: [{ source: "self_report", observationId: "fatigue" }], changes: [
    { type: "ADD_REST", activityId: "rest", title: "Rest", startsAt: "2026-11-14T09:00:00Z", endsAt: "2026-11-14T09:20:00Z" },
    { type: "MOVE_ACTIVITY", activityId: "science-1", startsAt: "2026-11-14T09:20:00Z", endsAt: "2026-11-14T10:00:00Z" },
  ] };
  const proposals = new ProposalService(new DemoScheduleValidator());
  const result = repairDemoProposal(candidate, context, schedule, proposals, Date.parse(confirmedAt));
  assert.equal(result?.outcome, "proposal");
  if (result?.outcome === "proposal") {
    assert.ok(result.proposal.candidate.changes.some((change) => change.type === "MOVE_ACTIVITY" && change.activityId === "science-2"));
    assert.equal(new DemoScheduleValidator().validate({ schedule, context, candidate: result.proposal.candidate }).valid, true);
  }
  assert.equal(repairDemoProposal(candidate, context, schedule, proposals, Date.parse("2026-11-14T15:00:00Z")), null);
});

test("ground rejection leaves the original schedule untouched", async () => {
  const h = await setup("poor");
  try {
    const proposal = (await h.repository.getSessionState("astro-1", "session-plan"))!.proposal!;
    const response = await h.handlers.decide(decision("ground", "REJECT"), proposal.id);
    assert.equal(response.status, 200); assert.equal((await response.json()).data.proposal.status, "REJECTED");
    assert.equal((await h.schedule.getDay("astro-1", "2026-11-14")).version, 1);
  } finally { await h.cleanup(); }
});

test("rested and insufficient scenarios produce reports with an explicit no-change reason", async () => {
  for (const kind of ["rested", "missing"] as const) {
    const h = await setup(kind);
    try {
      const state = await h.repository.getSessionState("astro-1", "session-plan");
      assert.equal(state!.generationStatus, "READY"); assert.equal(state!.proposal, null); assert.ok(state!.noChangeReason);
    } finally { await h.cleanup(); }
  }
});

test("generation uses the frozen program even when the live version changes, and ground sees a stale proposal", async () => {
  const h = await setup("poor", true);
  try {
    const proposal = (await h.repository.getSessionState("astro-1", "session-plan"))!.proposal!;
    assert.equal(proposal.baseScheduleVersion, 1);
    assert.equal((await h.schedule.getDay("astro-1", "2026-11-14")).version, 2);
    const response = await h.handlers.decide(decision("ground", "APPROVE"), proposal.id);
    assert.equal(response.status, 409);
    assert.equal((await h.repository.getProposal("astro-1", proposal.id))!.status, "STALE");
  } finally { await h.cleanup(); }
});

test("ground approval after the proposed rest has started cannot apply a change in the past", async () => {
  const h = await setup("poor", false, new Date("2026-11-14T10:00:00Z"));
  try {
    const proposal = (await h.repository.getSessionState("astro-1", "session-plan"))!.proposal!;
    const response = await h.handlers.decide(decision("ground", "APPROVE"), proposal.id);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.proposal.status, "APPLY_FAILED"); assert.equal(body.data.schedule, null);
    assert.equal((await h.schedule.getDay("astro-1", "2026-11-14")).version, 1);
  } finally { await h.cleanup(); }
});
