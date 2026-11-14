import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  type CheckIn, type DiaryEntry, type GroundReport, type Identity,
  type OperationalContext, type ProposalCandidate, type ScheduleChange,
  type SharedCheckIn,
} from "../../server/agent/contracts";
import { PrismaAgentRepository } from "../../server/agent/adapters/prisma/repository";
import { SimulatedScheduleProvider } from "../../server/agent/adapters/schedule";
import { isAgentError } from "../../server/agent/core/errors";
import { ApprovalService } from "../../server/agent/services/approval";
import { CheckInService } from "../../server/agent/services/checkin";
import { ProposalService } from "../../server/agent/services/proposals";
import { ScheduleValidatorImpl } from "../../server/agent/services/validator";
import {
  baseSchedule, DEMO_ASTRONAUT_ID, DEMO_DATE, sensorReadings,
} from "../../server/agent/simulator/scenarios";
import { createTestDb, seedIdentities, seedSchedule, type TestDb } from "./helpers/db";

let db: TestDb;
let repository: PrismaAgentRepository;
let scheduleProvider: SimulatedScheduleProvider;
let validator: ScheduleValidatorImpl;
let proposalService: ProposalService;
let checkInService: CheckInService;
let approvalService: ApprovalService;

before(async () => {
  db = createTestDb();
  await seedIdentities(db.prisma);
  await seedSchedule(db.prisma);
  repository = new PrismaAgentRepository(db.prisma);
  scheduleProvider = new SimulatedScheduleProvider(db.prisma);
  validator = new ScheduleValidatorImpl();
  proposalService = new ProposalService(validator);
  checkInService = new CheckInService(repository);
  approvalService = new ApprovalService(repository, scheduleProvider);
});

after(async () => {
  await db.cleanup();
});

const schedule = baseSchedule();
const changes: ScheduleChange[] = [
  { type: "MOVE_ACTIVITY", activityId: "science-1", startsAt: "2026-11-14T09:20:00Z", endsAt: "2026-11-14T10:00:00Z" },
  { type: "ADD_REST", activityId: "rest-1", title: "Pausa", startsAt: "2026-11-14T09:00:00Z", endsAt: "2026-11-14T09:20:00Z" },
];

const sharedCheckIn: SharedCheckIn = {
  id: "checkin-1",
  astronautId: DEMO_ASTRONAUT_ID,
  confirmedAt: "2026-11-14T06:03:00Z",
  observations: [
    { id: "obs-hours", field: "SLEEP_HOURS", value: 4.5, source: "self_report", recordedAt: "2026-11-14T06:01:00Z" },
    { id: "obs-fatigue", field: "FATIGUE", value: 4, source: "self_report", recordedAt: "2026-11-14T06:01:00Z" },
  ],
};
const sensors = sensorReadings("POOR_SLEEP");
const context: OperationalContext = { checkIn: sharedCheckIn, sensors };

const validCandidate: ProposalCandidate = {
  rationale: "Pausa prima dell'attivita flessibile, sulla base della stanchezza riferita.",
  evidence: [
    { source: "self_report", observationId: "obs-fatigue" },
    { source: "sensor", sensorReadingId: "sensor-sleep" },
  ],
  changes,
};

test("validator accepts the demonstrative candidate and rejects each rule violation", () => {
  const valid = validator.validate({ schedule, candidate: validCandidate, context });
  assert.equal(valid.valid, true);
  if (valid.valid) {
    assert.equal(valid.preview.version, 2);
    assert.ok(valid.preview.activities.some((a) => a.kind === "REST"));
  }

  const cases: { candidate: ProposalCandidate; code: string }[] = [
    {
      candidate: { ...validCandidate, changes: [{ type: "MOVE_ACTIVITY", activityId: "comm-1", startsAt: "2026-11-14T08:30:00Z", endsAt: "2026-11-14T09:00:00Z" }] },
      code: "LOCKED_ACTIVITY",
    },
    {
      candidate: { ...validCandidate, changes: [{ type: "MOVE_ACTIVITY", activityId: "nope-1", startsAt: "2026-11-14T09:20:00Z", endsAt: "2026-11-14T10:00:00Z" }] },
      code: "UNKNOWN_ACTIVITY",
    },
    {
      candidate: { ...validCandidate, changes: [{ type: "MOVE_ACTIVITY", activityId: "science-1", startsAt: "2026-11-14T09:20:00Z", endsAt: "2026-11-14T10:30:00Z" }] },
      code: "DURATION_CHANGED",
    },
    {
      candidate: { ...validCandidate, changes: [{ type: "MOVE_ACTIVITY", activityId: "science-1", startsAt: "2026-11-14T20:00:00Z", endsAt: "2026-11-14T20:40:00Z" }] },
      code: "OUTSIDE_WINDOW",
    },
    {
      candidate: { ...validCandidate, changes: [{ type: "ADD_REST", activityId: "rest-2", title: "Pausa", startsAt: "2026-11-14T08:00:00Z", endsAt: "2026-11-14T09:00:00Z" }] },
      code: "OVERLAP",
    },
    {
      candidate: { ...validCandidate, evidence: [{ source: "self_report", observationId: "obs-private" }] },
      code: "UNSHARED_EVIDENCE",
    },
    {
      candidate: { ...validCandidate, changes: [{ type: "ADD_REST", activityId: "comm-1", title: "Pausa", startsAt: "2026-11-14T10:00:00Z", endsAt: "2026-11-14T10:20:00Z" }] },
      code: "DUPLICATE_ACTIVITY",
    },
  ];

  for (const { candidate, code } of cases) {
    const result = validator.validate({ schedule, candidate, context });
    assert.equal(result.valid, false, `expected ${code}`);
    if (!result.valid) {
      assert.ok(result.violations.some((v) => v.code === code), `missing ${code} in ${JSON.stringify(result.violations)}`);
    }
  }
});

test("proposal service builds an immutable PENDING_REVIEW proposal only for valid candidates", () => {
  const built = proposalService.build(validCandidate, context, schedule);
  assert.equal(built.outcome, "proposal");
  if (built.outcome === "proposal") {
    assert.equal(built.proposal.status, "PENDING_REVIEW");
    assert.equal(built.proposal.baseScheduleVersion, schedule.version);
    assert.equal(built.proposal.checkInId, sharedCheckIn.id);
  }
  const invalid = proposalService.build(
    { ...validCandidate, changes: [{ type: "MOVE_ACTIVITY", activityId: "comm-1", startsAt: "2026-11-14T08:30:00Z", endsAt: "2026-11-14T09:00:00Z" }] },
    context,
    schedule,
  );
  assert.equal(invalid.outcome, "invalid");
});

const astronaut: Identity = { userId: "astro-1", role: "ASTRONAUT", astronautId: DEMO_ASTRONAUT_ID };
const ground: Identity = { userId: "ground-1", role: "GROUND_CONTROL", astronautIds: [DEMO_ASTRONAUT_ID] };

function draftCheckIn(sessionId: string): CheckIn {
  return {
    id: `checkin-${sessionId}`,
    astronautId: DEMO_ASTRONAUT_ID,
    sessionId,
    revision: 1,
    status: "DRAFT",
    observations: [
      { id: "obs-hours", field: "SLEEP_HOURS", value: 4.5, source: "self_report", messageIds: ["message-1"], recordedAt: "2026-11-14T06:01:00Z" },
      { id: "obs-fatigue", field: "FATIGUE", value: 4, source: "self_report", messageIds: ["message-1"], recordedAt: "2026-11-14T06:01:00Z" },
    ],
    sharedObservationIds: [],
    createdAt: "2026-11-14T06:01:00Z",
    confirmedAt: null,
  };
}

async function setUpConfirmedCheckInWithProposal(sessionId: string): Promise<{ checkInId: string; proposalId: string }> {
  await repository.createSession({
    id: sessionId,
    astronautId: DEMO_ASTRONAUT_ID,
    openedAt: "2026-11-14T06:00:00Z",
    closedAt: null,
  });
  const request = { clientMessageId: `client-${sessionId}`, text: "Sono stanco.", inputMode: "TEXT" as const };
  const result = {
    astronautMessage: { id: `message-${sessionId}`, sessionId, role: "ASTRONAUT" as const, text: request.text, createdAt: "2026-11-14T06:01:00Z", inputMode: "TEXT" as const },
    assistantMessage: { id: `message-a-${sessionId}`, sessionId, role: "ASSISTANT" as const, text: "Capisco.", createdAt: "2026-11-14T06:01:00Z", inputMode: "TEXT" as const },
    checkIn: draftCheckIn(sessionId),
  };
  await repository.commitTurn({
    astronautId: DEMO_ASTRONAUT_ID,
    sessionId,
    request,
    expectedCheckInRevision: null,
    result,
  });
  const checkInId = `checkin-${sessionId}`;
  const confirmed = await checkInService.confirm(astronaut, checkInId, {
    expectedRevision: 1,
    sharedObservationIds: ["obs-hours", "obs-fatigue"],
  });

  const candidate: ProposalCandidate = {
    rationale: "Pausa prima dell'attivita flessibile.",
    evidence: [
      { source: "self_report", observationId: "obs-fatigue" },
      { source: "sensor", sensorReadingId: "sensor-sleep" },
    ],
    changes,
  };
  const shared: SharedCheckIn = {
    id: confirmed.id,
    astronautId: DEMO_ASTRONAUT_ID,
    confirmedAt: confirmed.confirmedAt!,
    observations: [
      { id: "obs-hours", field: "SLEEP_HOURS", value: 4.5, source: "self_report", recordedAt: "2026-11-14T06:01:00Z" },
      { id: "obs-fatigue", field: "FATIGUE", value: 4, source: "self_report", recordedAt: "2026-11-14T06:01:00Z" },
    ],
  };
  const built = proposalService.build(candidate, { checkIn: shared, sensors }, schedule);
  if (built.outcome !== "proposal") throw new Error("expected a valid proposal");
  const proposal = built.proposal;

  const report: GroundReport = {
    id: `report-${sessionId}`,
    astronautId: DEMO_ASTRONAUT_ID,
    checkInId: confirmed.id,
    generatedAt: "2026-11-14T06:04:00Z",
    findings: [{ text: "Stanchezza riferita.", source: "self_report", evidence: [{ source: "self_report", observationId: "obs-fatigue" }] }],
    discrepancies: [],
    uncertainties: [],
    humanReview: { required: false, reason: null },
    proposalId: proposal.id,
  };
  const diary: DiaryEntry = {
    id: `diary-${sessionId}`,
    astronautId: DEMO_ASTRONAUT_ID,
    checkInId: confirmed.id,
    date: DEMO_DATE,
    text: "Notte difficile.",
    revision: 1,
    status: "DRAFT",
    visibility: "PRIVATE",
    updatedAt: "2026-11-14T06:04:00Z",
  };
  const claim = await repository.claimGeneration(DEMO_ASTRONAUT_ID, confirmed.id, 60_000);
  assert.ok(claim);
  await repository.completeGeneration(claim, { report, diary, proposal, noChangeReason: null });
  return { checkInId: confirmed.id, proposalId: proposal.id };
}

test("check-in service enforces astronaut-only access and sharing membership", async () => {
  const sessionId = "session-10";
  await repository.createSession({ id: sessionId, astronautId: DEMO_ASTRONAUT_ID, openedAt: "2026-11-14T06:00:00Z", closedAt: null });
  await repository.commitTurn({
    astronautId: DEMO_ASTRONAUT_ID,
    sessionId,
    request: { clientMessageId: "client-10", text: "Ciao.", inputMode: "TEXT" },
    expectedCheckInRevision: null,
    result: {
      astronautMessage: { id: "message-10", sessionId, role: "ASTRONAUT", text: "Ciao.", createdAt: "2026-11-14T06:01:00Z", inputMode: "TEXT" },
      assistantMessage: { id: "message-a-10", sessionId, role: "ASSISTANT", text: "Ciao.", createdAt: "2026-11-14T06:01:00Z", inputMode: "TEXT" },
      checkIn: draftCheckIn(sessionId),
    },
  });
  const checkInId = `checkin-${sessionId}`;
  await assert.rejects(
    () => checkInService.confirm(ground, checkInId, { expectedRevision: 1, sharedObservationIds: [] }),
    (error: unknown) => isAgentError(error) && error.code === "FORBIDDEN",
  );
  await assert.rejects(
    () => checkInService.confirm(astronaut, checkInId, { expectedRevision: 1, sharedObservationIds: ["obs-private"] }),
    (error: unknown) => isAgentError(error) && error.code === "INVALID_STATE",
  );
});

test("approval service applies an approved variation exactly once", async () => {
  const { proposalId } = await setUpConfirmedCheckInWithProposal("session-20");
  const proposal = await repository.getProposal(DEMO_ASTRONAUT_ID, proposalId);
  assert.ok(proposal);
  assert.equal(proposal.status, "PENDING_REVIEW");

  const first = await approvalService.decide({
    identity: ground,
    proposalId: proposal.id,
    idempotencyKey: "approve-1",
    request: { decision: "APPROVE", comment: "Compatibile." },
  });
  assert.equal(first.proposal.status, "APPLIED");
  assert.ok(first.decision);
  assert.equal(first.decision.decision, "APPROVE");
  assert.equal(first.schedule?.version, 2);

  // The schedule is really version 2 now.
  assert.equal((await scheduleProvider.getById("schedule-1"))?.version, 2);

  // Identical retry returns the original result with no new effects.
  const replay = await approvalService.decide({
    identity: ground,
    proposalId: proposal.id,
    idempotencyKey: "approve-1",
    request: { decision: "APPROVE", comment: "Compatibile." },
  });
  assert.equal(replay.proposal.status, "APPLIED");
  assert.equal(replay.schedule?.version, 2);
  assert.equal((await scheduleProvider.getById("schedule-1"))?.version, 2);
});

test("approval service rejects and enforces stale and scope checks", async () => {
  const { proposalId } = await setUpConfirmedCheckInWithProposal("session-21");
  const proposal = await repository.getProposal(DEMO_ASTRONAUT_ID, proposalId);
  assert.ok(proposal);

  // Non-ground operator is forbidden.
  await assert.rejects(
    () => approvalService.decide({ identity: astronaut, proposalId: proposal.id, idempotencyKey: "k", request: { decision: "APPROVE", comment: null } }),
    (error: unknown) => isAgentError(error) && error.code === "FORBIDDEN",
  );

  // Ground operator out of scope cannot even see the proposal.
  const outOfScope: Identity = { userId: "ground-2", role: "GROUND_CONTROL", astronautIds: ["astro-2"] };
  await assert.rejects(
    () => approvalService.decide({ identity: outOfScope, proposalId: proposal.id, idempotencyKey: "k", request: { decision: "APPROVE", comment: null } }),
    (error: unknown) => isAgentError(error) && error.code === "NOT_FOUND",
  );

  // A concurrent schedule change makes the proposal stale before decision.
  await db.prisma.scheduleSnapshot.update({ where: { id: "schedule-1" }, data: { version: 5 } });
  await assert.rejects(
    () => approvalService.decide({ identity: ground, proposalId: proposal.id, idempotencyKey: "k", request: { decision: "APPROVE", comment: null } }),
    (error: unknown) => isAgentError(error) && error.code === "VERSION_CONFLICT",
  );
  assert.equal((await repository.getProposal(DEMO_ASTRONAUT_ID, proposal.id))?.status, "STALE");
});
