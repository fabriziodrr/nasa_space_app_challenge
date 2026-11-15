// Serialization boundary between Prisma rows and the public contract objects.
// Timestamps are normalized to whole-second ISO 8601 UTC strings on read; JSON
// blobs are re-parsed and validated against the shared Zod schemas.
import { z } from "zod";
import {
  FindingSchema, IdSchema, ObservationsSchema, ProposalCandidateSchema,
  ScheduleActivitySchema, TextSchema,
} from "../../contracts";
import type {
  CheckIn, ConversationMessage, ConversationSession, DiaryEntry, GroundReport,
  ProposalDecision, ScheduleProposal, ScheduleSnapshot,
} from "../../contracts";

import { toDate, toIso } from "../../lib/time";

export { toDate, toIso };

export function toJson(value: unknown): string {
  return JSON.stringify(value);
}

function parseJson<T>(json: string, schema: z.ZodType<T>): T {
  return schema.parse(JSON.parse(json));
}

export interface SessionRow {
  id: string;
  astronautId: string;
  openedAt: Date;
  closedAt: Date | null;
}
export function sessionFromRow(row: SessionRow): ConversationSession {
  return {
    id: row.id,
    astronautId: row.astronautId,
    openedAt: toIso(row.openedAt),
    closedAt: row.closedAt ? toIso(row.closedAt) : null,
  };
}

export interface MessageRow {
  id: string;
  sessionId: string;
  role: string;
  text: string;
  createdAt: Date;
  inputMode: string;
}
export function messageFromRow(row: MessageRow): ConversationMessage {
  return {
    id: row.id,
    sessionId: row.sessionId,
    role: row.role as ConversationMessage["role"],
    text: row.text,
    createdAt: toIso(row.createdAt),
    inputMode: row.inputMode as ConversationMessage["inputMode"],
  };
}

export interface CheckInRow {
  id: string;
  astronautId: string;
  sessionId: string;
  revision: number;
  status: string;
  observationsJson: string;
  sharedObservationIdsJson: string;
  createdAt: Date;
  confirmedAt: Date | null;
}
export function checkInFromRow(row: CheckInRow): CheckIn {
  return {
    id: row.id,
    astronautId: row.astronautId,
    sessionId: row.sessionId,
    revision: row.revision,
    status: row.status as CheckIn["status"],
    observations: parseJson(row.observationsJson, ObservationsSchema).map((observation) =>
      (observation.field === "SLEEP_QUALITY" || observation.field === "FATIGUE") && observation.scaleMax === undefined
        ? { ...observation, scaleMax: null } : observation),
    sharedObservationIds: parseJson(row.sharedObservationIdsJson, z.array(IdSchema)),
    createdAt: toIso(row.createdAt),
    confirmedAt: row.confirmedAt ? toIso(row.confirmedAt) : null,
  };
}

export interface ProposalRow {
  id: string;
  astronautId: string;
  checkInId: string;
  scheduleId: string;
  baseScheduleVersion: number;
  createdAt: Date;
  candidateJson: string;
  status: string;
  decisionId: string | null;
  appliedScheduleVersion: number | null;
  appliedAt: Date | null;
}
export function proposalFromRow(row: ProposalRow): ScheduleProposal {
  return {
    id: row.id,
    astronautId: row.astronautId,
    checkInId: row.checkInId,
    scheduleId: row.scheduleId,
    baseScheduleVersion: row.baseScheduleVersion,
    createdAt: toIso(row.createdAt),
    candidate: parseJson(row.candidateJson, ProposalCandidateSchema),
    status: row.status as ScheduleProposal["status"],
    decisionId: row.decisionId,
    appliedScheduleVersion: row.appliedScheduleVersion,
    appliedAt: row.appliedAt ? toIso(row.appliedAt) : null,
  };
}

export interface DecisionRow {
  id: string;
  proposalId: string;
  operatorId: string;
  decision: string;
  comment: string | null;
  decidedAt: Date;
  idempotencyKey: string;
}
export function decisionFromRow(row: DecisionRow): ProposalDecision {
  return {
    id: row.id,
    proposalId: row.proposalId,
    operatorId: row.operatorId,
    decision: row.decision as ProposalDecision["decision"],
    comment: row.comment,
    decidedAt: toIso(row.decidedAt),
    idempotencyKey: row.idempotencyKey,
  };
}

export interface ReportRow {
  id: string;
  astronautId: string;
  checkInId: string;
  generatedAt: Date;
  findingsJson: string;
  discrepanciesJson: string;
  uncertaintiesJson: string;
  humanReviewRequired: boolean;
  humanReviewReason: string | null;
  proposalId: string | null;
}
export function reportFromRow(row: ReportRow): GroundReport {
  return {
    id: row.id,
    astronautId: row.astronautId,
    checkInId: row.checkInId,
    generatedAt: toIso(row.generatedAt),
    findings: parseJson(row.findingsJson, z.array(FindingSchema)),
    discrepancies: parseJson(row.discrepanciesJson, z.array(FindingSchema)),
    uncertainties: parseJson(row.uncertaintiesJson, z.array(TextSchema)),
    humanReview: { required: row.humanReviewRequired, reason: row.humanReviewReason },
    proposalId: row.proposalId,
  };
}

export interface DiaryRow {
  id: string;
  astronautId: string;
  checkInId: string;
  date: string;
  text: string;
  revision: number;
  status: string;
  visibility: string;
  updatedAt: Date;
}
export function diaryFromRow(row: DiaryRow): DiaryEntry {
  return {
    id: row.id,
    astronautId: row.astronautId,
    checkInId: row.checkInId,
    date: row.date,
    text: row.text,
    revision: row.revision,
    status: row.status as DiaryEntry["status"],
    visibility: row.visibility as DiaryEntry["visibility"],
    updatedAt: toIso(row.updatedAt),
  };
}

export interface ScheduleRow {
  id: string;
  astronautId: string;
  date: string;
  timeZone: string;
  version: number;
  dayStartsAt: Date;
  dayEndsAt: Date;
  activitiesJson: string;
}
export function scheduleFromRow(row: ScheduleRow): ScheduleSnapshot {
  return {
    id: row.id,
    astronautId: row.astronautId,
    date: row.date,
    timeZone: row.timeZone,
    version: row.version,
    dayStartsAt: toIso(row.dayStartsAt),
    dayEndsAt: toIso(row.dayEndsAt),
    activities: parseJson(row.activitiesJson, z.array(ScheduleActivitySchema)),
  };
}
