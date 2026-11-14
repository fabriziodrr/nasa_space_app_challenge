import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { z } from "zod";
import {
  ApiErrorSchema, CheckInSchema, ConfirmCheckInRequestSchema,
  CreateSessionRequestSchema, DecideProposalRequestSchema, DecisionResponseSchema,
  ConversationSessionSchema, DiaryEntrySchema, ERROR_HTTP_STATUS, FindingSchema, GroundReportSchema,
  IdempotencyHeadersSchema, IdentitySchema, ListQuerySchema, ObservationSchema,
  OperationalContextSchema, OperationalOutputSchema, ProposalCandidateSchema,
  ProposalDecisionSchema, ScheduleApplyResultSchema, ScheduleProposalSchema,
  ScheduleSnapshotSchema, SendMessageRequestSchema, SensorReadingSchema,
  SessionResponseSchema, TimestampSchema, TranscriptionMetadataSchema,
  UpdateCheckInRequestSchema, UpdateDiaryRequestSchema,
} from "../../server/agent/contracts";

// JSON examples are the shared integration fixtures, not snapshots of implementation output.
function example(name: string): unknown {
  return JSON.parse(readFileSync(path.join(process.cwd(), "docs/agent/examples", name), "utf8"));
}
const NormalExampleSchema = z.strictObject({
  createSessionRequest: CreateSessionRequestSchema,
  messageRequest: SendMessageRequestSchema,
  confirmRequest: ConfirmCheckInRequestSchema,
  decisionRequest: DecideProposalRequestSchema,
  decisionHeaders: IdempotencyHeadersSchema,
  session: ConversationSessionSchema,
  confirmedCheckIn: CheckInSchema,
  sensors: z.array(SensorReadingSchema),
  schedule: ScheduleSnapshotSchema,
  pendingProposal: ScheduleProposalSchema,
  report: GroundReportSchema,
  diary: DiaryEntrySchema,
  decision: ProposalDecisionSchema,
});
const normal = NormalExampleSchema.parse(example("normal.json"));

test("normal integration example is valid and references the same check-in and proposal", () => {
  assert.equal(normal.report.checkInId, normal.confirmedCheckIn.id);
  assert.equal(normal.report.proposalId, normal.pendingProposal.id);
  assert.equal(normal.decision.proposalId, normal.pendingProposal.id);
  assert.deepEqual(normal.confirmRequest.sharedObservationIds, normal.confirmedCheckIn.sharedObservationIds);
  for (const ref of normal.pendingProposal.candidate.evidence) {
    if (ref.source === "self_report") {
      assert.ok(normal.confirmedCheckIn.sharedObservationIds.includes(ref.observationId));
    } else if (ref.source === "sensor") {
      assert.ok(normal.sensors.some((sensor) => sensor.id === ref.sensorReadingId));
    } else assert.fail("The legacy example does not include vision evidence");
  }
});

test("approved response example contains the actual new schedule and preserves the locked activity", () => {
  const response = DecisionResponseSchema.parse(example("normal-response.json"));
  assert.equal(response.data.proposal.status, "APPLIED");
  assert.equal(response.data.schedule?.version, 2);
  assert.deepEqual(response.data.schedule?.activities.find((a) => a.id === "comm-1"), normal.schedule.activities[0]);
  const moved = response.data.schedule?.activities.find((a) => a.id === "science-1");
  assert.equal(moved?.startsAt, "2026-11-14T09:20:00Z");
  assert.ok(response.data.schedule?.activities.some((a) => a.kind === "REST"));
});

test("no-change example expresses a completed analysis, not an unfinished generation", () => {
  const response = SessionResponseSchema.parse(example("no-change.json"));
  assert.equal(response.data.generationStatus, "READY");
  assert.equal(response.data.proposal, null);
  assert.ok(response.data.noChangeReason);
});

test("stale example maps to HTTP 409 and cannot be blindly retried", () => {
  const response = ApiErrorSchema.parse(example("stale.json"));
  assert.equal(ERROR_HTTP_STATUS[response.error.code], 409);
  assert.equal(response.error.retryable, false);
  assert.equal(response.error.currentVersion, 2);
});

test("role and operator cannot be injected through request bodies", () => {
  assert.equal(CreateSessionRequestSchema.safeParse({ astronautId: "astro-1", role: "GROUND_CONTROL" }).success, false);
  assert.equal(DecideProposalRequestSchema.safeParse({ decision: "APPROVE", comment: null, operatorId: "ground-1" }).success, false);
  assert.equal(SendMessageRequestSchema.safeParse({ ...normal.messageRequest, role: "ASSISTANT" }).success, false);
});

test("verified ground identity requires an explicit nonempty astronaut scope", () => {
  assert.equal(IdentitySchema.safeParse({ userId: "ground-1", role: "GROUND_CONTROL", astronautIds: [] }).success, false);
  assert.equal(IdentitySchema.safeParse({ userId: "astro-1", role: "ASTRONAUT", astronautId: "astro-1" }).success, true);
});

test("UTC timestamps reject local times, offsets and invalid dates", () => {
  for (const value of ["2026-11-14T06:00:00", "2026-11-14T07:00:00+01:00", "2026-02-30T06:00:00Z"]) {
    assert.equal(TimestampSchema.safeParse(value).success, false, value);
  }
});

test("subjective scales require explicit numbers in the documented range", () => {
  const fatigue = normal.confirmedCheckIn.observations.find((o) => o.field === "FATIGUE")!;
  for (const value of [0, 6, 2.5, "4", null]) {
    assert.equal(ObservationSchema.safeParse({ ...fatigue, value }).success, false);
  }
});

test("zero reported sleep is preserved as a valid value, missing data is not fabricated", () => {
  const hours = normal.confirmedCheckIn.observations[0];
  assert.equal(ObservationSchema.parse({ ...hours, value: 0 }).value, 0);
  assert.equal(ObservationSchema.safeParse({ ...hours, value: undefined }).success, false);
  assert.equal(CheckInSchema.safeParse({ ...normal.confirmedCheckIn, observations: [], sharedObservationIds: [] }).success, true);
});

test("sensor values use metric-specific units and unavailable measurements stay null", () => {
  const sensor = normal.sensors[0];
  assert.equal(SensorReadingSchema.safeParse({ ...sensor, unit: "bpm" }).success, false);
  assert.equal(SensorReadingSchema.safeParse({ ...sensor, quality: "UNAVAILABLE" }).success, false);
  assert.equal(SensorReadingSchema.safeParse({ ...sensor, value: null }).success, false);
  assert.equal(SensorReadingSchema.safeParse({ ...sensor, quality: "UNAVAILABLE", value: null }).success, true);
});

test("check-in sharing cannot reference absent observations or duplicate fields", () => {
  assert.equal(CheckInSchema.safeParse({ ...normal.confirmedCheckIn, sharedObservationIds: ["private-nonexistent"] }).success, false);
  assert.equal(CheckInSchema.safeParse({ ...normal.confirmedCheckIn, observations: [
    ...normal.confirmedCheckIn.observations, { ...normal.confirmedCheckIn.observations[0], id: "other-id" },
  ] }).success, false);
  assert.equal(CheckInSchema.safeParse({ ...normal.confirmedCheckIn, status: "DRAFT" }).success, false);
});

test("sharing an empty selection is supported and correction is revisioned", () => {
  assert.equal(ConfirmCheckInRequestSchema.safeParse({ expectedRevision: 1, sharedObservationIds: [] }).success, true);
  assert.equal(UpdateCheckInRequestSchema.safeParse({ expectedRevision: 0, observations: [] }).success, false);
  assert.equal(UpdateCheckInRequestSchema.safeParse({ expectedRevision: 1, observations: [], status: "CONFIRMED" }).success, false);
});

test("operational provider input rejects transcripts and private observation message references", () => {
  const shared = {
    id: "checkin-1", astronautId: "astro-1", confirmedAt: "2026-11-14T06:03:00Z", observations: [],
  };
  assert.equal(OperationalContextSchema.safeParse({ checkIn: shared, sensors: normal.sensors }).success, true);
  assert.equal(OperationalContextSchema.safeParse({ checkIn: shared, sensors: [], messages: ["private text"] }).success, false);
  assert.equal(OperationalContextSchema.safeParse({
    checkIn: { ...shared, observations: normal.confirmedCheckIn.observations }, sensors: [],
  }).success, false);
});

test("findings cannot disguise a mixed deduction as measured data", () => {
  assert.equal(FindingSchema.safeParse({ text: "A deduction", source: "sensor", evidence: [
    { source: "self_report", observationId: "obs-fatigue" },
  ] }).success, false);
  assert.equal(FindingSchema.safeParse({ text: "No evidence", source: "inference", evidence: [] }).success, false);
});

test("proposal candidates reject empty changes, duplicate operations and inverted intervals", () => {
  const candidate = normal.pendingProposal.candidate;
  assert.equal(ProposalCandidateSchema.safeParse({ ...candidate, changes: [] }).success, false);
  assert.equal(ProposalCandidateSchema.safeParse({ ...candidate, changes: [candidate.changes[0], candidate.changes[0]] }).success, false);
  assert.equal(ProposalCandidateSchema.safeParse({ ...candidate, changes: [
    { ...candidate.changes[0], endsAt: "2026-11-14T08:00:00Z" },
  ] }).success, false);
});

test("AI output must choose either a proposal or an explicit reason for no change", () => {
  const { findings, discrepancies, uncertainties, humanReview } = normal.report;
  const report = { findings, discrepancies, uncertainties, humanReview };
  assert.equal(OperationalOutputSchema.safeParse({ report, proposal: null, noChangeReason: null }).success, false);
  assert.equal(OperationalOutputSchema.safeParse({ report, proposal: normal.pendingProposal.candidate, noChangeReason: "No change" }).success, false);
  assert.equal(OperationalOutputSchema.safeParse({ report, proposal: null, noChangeReason: "No operational reason to change." }).success, true);
});

test("approval alone cannot carry successful-application metadata", () => {
  const applied = DecisionResponseSchema.parse(example("normal-response.json")).data.proposal;
  assert.equal(ScheduleProposalSchema.safeParse({ ...applied, status: "APPROVED" }).success, false);
  assert.equal(ScheduleProposalSchema.safeParse({ ...applied, appliedScheduleVersion: 1 }).success, false);
  assert.equal(ScheduleProposalSchema.safeParse({ ...applied, decisionId: null }).success, false);
});

test("decision response cannot present an unapplied or unrelated schedule as updated", () => {
  const response = DecisionResponseSchema.parse(example("normal-response.json"));
  assert.equal(DecisionResponseSchema.safeParse({ ...response, data: {
    ...response.data, schedule: normal.schedule,
  } }).success, false);
  assert.equal(DecisionResponseSchema.safeParse({ ...response, data: {
    ...response.data, decision: { ...normal.decision, decision: "REJECT" },
  } }).success, false);
});

test("unknown application result cannot pretend to include an applied schedule", () => {
  assert.equal(ScheduleApplyResultSchema.safeParse({ outcome: "UNKNOWN" }).success, true);
  assert.equal(ScheduleApplyResultSchema.safeParse({ outcome: "UNKNOWN", schedule: normal.schedule }).success, false);
});

test("completed session cannot ambiguously omit the no-change reason", () => {
  const response = SessionResponseSchema.parse(example("no-change.json"));
  assert.equal(SessionResponseSchema.safeParse({ ...response, data: { ...response.data, noChangeReason: null } }).success, false);
  assert.equal(SessionResponseSchema.safeParse({ ...response, data: { ...response.data, diaryEntryId: null } }).success, false);
});

test("diary visibility cannot be changed to shared through create or update payloads", () => {
  assert.equal(DiaryEntrySchema.safeParse({ ...normal.diary, visibility: "GROUND_CONTROL" }).success, false);
  assert.equal(UpdateDiaryRequestSchema.safeParse({ expectedRevision: 1, text: "Personal", status: "DRAFT", visibility: "SHARED" }).success, false);
});

test("audio metadata enforces upload limits and supported formats", () => {
  const metadata = { sessionId: "session-1", mimeType: "audio/webm", sizeBytes: 1000, durationSeconds: 10 };
  assert.equal(TranscriptionMetadataSchema.safeParse(metadata).success, true);
  for (const invalid of [{ sizeBytes: 0 }, { sizeBytes: 11 * 1024 * 1024 }, { durationSeconds: 121 }, { mimeType: "video/mp4" }]) {
    assert.equal(TranscriptionMetadataSchema.safeParse({ ...metadata, ...invalid }).success, false);
  }
});

test("list parameters bound result sizes without coercing untrusted query strings", () => {
  assert.equal(ListQuerySchema.parse({ astronautId: "astro-1" }).limit, 20);
  assert.equal(ListQuerySchema.safeParse({ astronautId: "astro-1", limit: 101 }).success, false);
  assert.equal(ListQuerySchema.safeParse({ astronautId: "astro-1", limit: "20" }).success, false);
});
