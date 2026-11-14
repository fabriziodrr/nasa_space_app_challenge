import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  ScheduleSnapshotSchema, SensorReadingSchema,
  type CheckIn, type ConversationSession, type GroundReport, type DiaryEntry,
  type MessageResult, type ProposalCandidate, type ScheduleChange,
  type SendMessageRequest,
} from "../../server/agent/contracts";
import { PrismaAgentRepository } from "../../server/agent/adapters/prisma/repository";
import { SimulatedScheduleProvider } from "../../server/agent/adapters/schedule";
import { SimulatedSensorProvider } from "../../server/agent/adapters/sensors";
import { AgentServiceError } from "../../server/agent/errors";
import {
  baseSchedule, DEMO_ASTRONAUT_ID, DEMO_DATE, SCENARIOS, SCENARIO_DEFINITIONS,
  sensorReadings,
} from "../../server/agent/simulator/scenarios";
import { createTestDb, seedIdentities, seedSchedule, type TestDb } from "./helpers/db";

let db: TestDb;
let repository: PrismaAgentRepository;
let scheduleProvider: SimulatedScheduleProvider;

before(async () => {
  db = createTestDb();
  await seedIdentities(db.prisma);
  await seedSchedule(db.prisma);
  repository = new PrismaAgentRepository(db.prisma);
  scheduleProvider = new SimulatedScheduleProvider(db.prisma);
});

after(async () => {
  await db.cleanup();
});

const changes: ScheduleChange[] = [
  { type: "MOVE_ACTIVITY", activityId: "science-1", startsAt: "2026-11-14T09:20:00Z", endsAt: "2026-11-14T10:00:00Z" },
  { type: "ADD_REST", activityId: "rest-1", title: "Pausa", startsAt: "2026-11-14T09:00:00Z", endsAt: "2026-11-14T09:20:00Z" },
];

function draftCheckIn(revision: number, sessionId: string): CheckIn {
  return {
    id: `checkin-${sessionId}`,
    astronautId: DEMO_ASTRONAUT_ID,
    sessionId,
    revision,
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

function messageRequest(clientMessageId: string): SendMessageRequest {
  return {
    clientMessageId,
    text: "Ho dormito male e sono stanco.",
    inputMode: "TEXT",
  };
}

function messageResult(clientMessageId: string, checkIn: CheckIn): MessageResult {
  return {
    astronautMessage: {
      id: `message-${clientMessageId}`,
      sessionId: checkIn.sessionId,
      role: "ASTRONAUT",
      text: messageRequest(clientMessageId).text,
      createdAt: "2026-11-14T06:01:00Z",
      inputMode: "TEXT",
    },
    assistantMessage: {
      id: `message-assistant-${clientMessageId}`,
      sessionId: checkIn.sessionId,
      role: "ASSISTANT",
      text: "Capisco. Parliamo del tuo riposo.",
      createdAt: "2026-11-14T06:01:00Z",
      inputMode: "TEXT",
    },
    checkIn,
  };
}

const session: ConversationSession = {
  id: "session-1",
  astronautId: DEMO_ASTRONAUT_ID,
  openedAt: "2026-11-14T06:00:00Z",
  closedAt: null,
};

test("the three scenarios are deterministic and schema-valid", () => {
  for (const scenario of SCENARIOS) {
    const first = sensorReadings(scenario);
    const second = sensorReadings(scenario);
    assert.deepEqual(first, second);
    for (const reading of first) {
      assert.doesNotThrow(() => SensorReadingSchema.parse(reading));
    }
    const definition = SCENARIO_DEFINITIONS[scenario];
    const sleep = first.find((r) => r.metric === "SLEEP_DURATION")!;
    assert.equal(sleep.value, definition.sleepHours);
    assert.equal(first.every((r) => r.scenario === scenario), true);
  }
});

test("simulated sensors are windowed by observedAt", async () => {
  const provider = new SimulatedSensorProvider("POOR_SLEEP");
  const inWindow = await provider.read(DEMO_ASTRONAUT_ID, {
    from: "2026-11-13T20:00:00Z",
    to: "2026-11-14T12:00:00Z",
  });
  assert.equal(inWindow.length, 3);
  const outOfWindow = await provider.read(DEMO_ASTRONAUT_ID, {
    from: "2026-11-15T00:00:00Z",
    to: "2026-11-15T23:59:59Z",
  });
  assert.equal(outOfWindow.length, 0);
});

test("schedule provider serves the seeded day and applies an approved command once", async () => {
  const day = await scheduleProvider.getDay(DEMO_ASTRONAUT_ID, DEMO_DATE);
  assert.deepEqual(day, baseSchedule());
  assert.doesNotThrow(() => ScheduleSnapshotSchema.parse(day));

  const command = {
    astronautId: DEMO_ASTRONAUT_ID,
    scheduleId: day.id,
    proposalId: "proposal-1",
    decisionId: "decision-1",
    expectedScheduleVersion: 1,
    changes,
  };
  const applied = await scheduleProvider.applyApproved(command);
  assert.equal(applied.outcome, "APPLIED");
  if (applied.outcome === "APPLIED") {
    assert.equal(applied.schedule.version, 2);
    assert.ok(applied.schedule.activities.some((a) => a.id === "rest-1"));
    assert.deepEqual(applied.schedule.activities.find((a) => a.id === "comm-1"), baseSchedule().activities[0]);
  }

  // Replay of the identical command returns the same result without a second mutation.
  const replay = await scheduleProvider.applyApproved(command);
  assert.equal(replay.outcome, "APPLIED");
  if (replay.outcome === "APPLIED") assert.equal(replay.schedule.version, 2);
  const version = await scheduleProvider.getById(day.id);
  assert.equal(version?.version, 2);

  // A stale expected version no longer matches the current one.
  const stale = await scheduleProvider.applyApproved({ ...command, expectedScheduleVersion: 1, decisionId: "decision-2", proposalId: "proposal-2" });
  assert.equal(stale.outcome, "STALE");
});

test("repository persists a turn idempotently and recovers the session state", async () => {
  await repository.createSession(session);
  const request = messageRequest("client-msg-1");
  const checkIn = draftCheckIn(1, session.id);
  const result = messageResult("client-msg-1", checkIn);

  const committed = await repository.commitTurn({
    astronautId: DEMO_ASTRONAUT_ID,
    sessionId: session.id,
    request,
    expectedCheckInRevision: null,
    result,
  });
  assert.deepEqual(committed, result);

  const turn = await repository.getTurn(DEMO_ASTRONAUT_ID, session.id, "client-msg-1");
  assert.deepEqual(turn?.result, result);
  assert.deepEqual(turn?.request, request);

  // Same payload replays; a different payload conflicts.
  const replay = await repository.commitTurn({
    astronautId: DEMO_ASTRONAUT_ID,
    sessionId: session.id,
    request,
    expectedCheckInRevision: null,
    result,
  });
  assert.deepEqual(replay, result);

  await assert.rejects(
    () => repository.commitTurn({
      astronautId: DEMO_ASTRONAUT_ID,
      sessionId: session.id,
      request,
      expectedCheckInRevision: null,
      result: messageResult("client-msg-1", draftCheckIn(2, session.id)),
    }),
    (error: unknown) => error instanceof AgentServiceError && error.code === "IDEMPOTENCY_CONFLICT",
  );

  const state = await repository.getSessionState(DEMO_ASTRONAUT_ID, session.id);
  assert.equal(state?.messages.length, 2);
  assert.equal(state?.checkIn?.revision, 1);
  assert.equal(state?.checkIn?.status, "DRAFT");
  assert.equal(state?.generationStatus, "NOT_STARTED");
});

test("check-in correction and confirmation enforce revision CAS and idempotency", async () => {
  const sessionId = "session-2";
  await repository.createSession({ ...session, id: sessionId });
  const request = messageRequest("client-msg-2");
  const result = messageResult("client-msg-2", draftCheckIn(1, sessionId));
  await repository.commitTurn({
    astronautId: DEMO_ASTRONAUT_ID,
    sessionId,
    request,
    expectedCheckInRevision: null,
    result,
  });

  const checkInId = draftCheckIn(1, sessionId).id;
  await assert.rejects(
    () => repository.updateCheckIn(DEMO_ASTRONAUT_ID, checkInId, { expectedRevision: 9, observations: [] }),
    (error: unknown) => error instanceof AgentServiceError && error.code === "VERSION_CONFLICT",
  );

  const updated = await repository.updateCheckIn(DEMO_ASTRONAUT_ID, checkInId, {
    expectedRevision: 1,
    observations: draftCheckIn(1, sessionId).observations,
  });
  assert.equal(updated.revision, 2);

  const confirmed = await repository.confirmCheckIn(DEMO_ASTRONAUT_ID, checkInId, {
    expectedRevision: 2,
    sharedObservationIds: ["obs-hours", "obs-fatigue"],
  });
  assert.equal(confirmed.status, "CONFIRMED");
  assert.equal(confirmed.revision, 3);

  // Identical confirmation is idempotent; a different selection conflicts.
  const replay = await repository.confirmCheckIn(DEMO_ASTRONAUT_ID, checkInId, {
    expectedRevision: 2,
    sharedObservationIds: ["obs-hours", "obs-fatigue"],
  });
  assert.equal(replay.status, "CONFIRMED");
  await assert.rejects(
    () => repository.confirmCheckIn(DEMO_ASTRONAUT_ID, checkInId, { expectedRevision: 2, sharedObservationIds: ["obs-hours"] }),
    (error: unknown) => error instanceof AgentServiceError && error.code === "INVALID_STATE",
  );
});

test("generation artifacts publish once and surface READY in the session state", async () => {
  const sessionId = "session-3";
  await repository.createSession({ ...session, id: sessionId });
  const request = messageRequest("client-msg-3");
  const checkIn = draftCheckIn(1, sessionId);
  const result = messageResult("client-msg-3", checkIn);
  await repository.commitTurn({
    astronautId: DEMO_ASTRONAUT_ID,
    sessionId,
    request,
    expectedCheckInRevision: null,
    result,
  });
  const confirmed = await repository.confirmCheckIn(DEMO_ASTRONAUT_ID, checkIn.id, {
    expectedRevision: 1,
    sharedObservationIds: ["obs-hours", "obs-fatigue"],
  });
  assert.equal(confirmed.status, "CONFIRMED");

  const claim = await repository.claimGeneration(DEMO_ASTRONAUT_ID, checkIn.id, 60_000);
  assert.ok(claim);
  assert.equal(await repository.claimGeneration(DEMO_ASTRONAUT_ID, checkIn.id, 60_000), null);

  const proposalCandidate: ProposalCandidate = {
    rationale: "Pausa dimostrativa.",
    evidence: [{ source: "self_report", observationId: "obs-fatigue" }],
    changes,
  };
  const report: GroundReport = {
    id: "report-1",
    astronautId: DEMO_ASTRONAUT_ID,
    checkInId: checkIn.id,
    generatedAt: "2026-11-14T06:04:00Z",
    findings: [{ text: "L'astronauta riferisce stanchezza 4 su 5.", source: "self_report", evidence: [{ source: "self_report", observationId: "obs-fatigue" }] }],
    discrepancies: [],
    uncertainties: ["Scenario dimostrativo."],
    humanReview: { required: false, reason: null },
    proposalId: "proposal-1",
  };
  const diary: DiaryEntry = {
    id: "diary-1",
    astronautId: DEMO_ASTRONAUT_ID,
    checkInId: checkIn.id,
    date: DEMO_DATE,
    text: "Notte difficile.",
    revision: 1,
    status: "DRAFT",
    visibility: "PRIVATE",
    updatedAt: "2026-11-14T06:04:00Z",
  };
  const proposal = {
    id: "proposal-1",
    astronautId: DEMO_ASTRONAUT_ID,
    checkInId: checkIn.id,
    scheduleId: "schedule-1",
    baseScheduleVersion: 1,
    createdAt: "2026-11-14T06:04:00Z",
    candidate: proposalCandidate,
    status: "PENDING_REVIEW" as const,
    decisionId: null,
    appliedScheduleVersion: null,
    appliedAt: null,
  };

  await repository.completeGeneration(claim, { report, diary, proposal, noChangeReason: null });
  await repository.completeGeneration(claim, { report, diary, proposal, noChangeReason: null });

  const state = await repository.getSessionState(DEMO_ASTRONAUT_ID, sessionId);
  assert.equal(state?.generationStatus, "READY");
  assert.equal(state?.reportId, "report-1");
  assert.equal(state?.diaryEntryId, "diary-1");
  assert.equal(state?.proposal?.status, "PENDING_REVIEW");

  const proposals = await repository.listProposals({ astronautId: DEMO_ASTRONAUT_ID, limit: 20 });
  assert.equal(proposals.items.length, 1);
  const reports = await repository.listReports({ astronautId: DEMO_ASTRONAUT_ID, limit: 20 });
  assert.equal(reports.items.length, 1);
  const diaryPage = await repository.listDiary(DEMO_ASTRONAUT_ID);
  assert.equal(diaryPage.items.length, 1);

  // Data is scoped per astronaut.
  const other = await repository.listProposals({ astronautId: "astro-2", limit: 20 });
  assert.equal(other.items.length, 0);
});
