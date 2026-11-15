import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { ProposalCandidateSchema, ScheduleApplyCommandSchema, ScheduleSnapshotSchema, type ProposalCandidate, type ScheduleApplyCommand, type ScheduleApplyResult, type ScheduleSnapshot } from "../contracts";
import { SimulatedScheduleProvider } from "./schedule";
import { AgentError } from "../core/errors";
import { activitiesOverlap, hasDependencyCycle } from "../lib/schedule";
import { sharedResourceConflicts } from "../lib/shared-resources";
import { scheduleFromRow } from "./prisma/mappers";
import { demoCrewMappings } from "../demo-crew";
import { applyScheduleChanges } from "../lib/schedule";

/** Illustrative UTC day: fixed meals, exercise, contacts and an 8.5 h sleep opportunity. */
export function demoProgram(astronautId: string, date: string): ScheduleSnapshot {
  const nextDate = new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const fixed = (id: string, title: string, kind: "MISSION" | "MEAL" | "EXERCISE" | "REST", start: string, end: string) => ({
    id, title, kind, startsAt: start, endsAt: end, priority: "CRITICAL", movable: false,
    dependsOn: [], earliestStart: start, latestEnd: end,
  });
  return ScheduleSnapshotSchema.parse({ id: `demo-${astronautId}-${date}`, astronautId, date, timeZone: "Etc/UTC", version: 1,
    dayStartsAt: `${date}T06:00:00Z`, dayEndsAt: `${nextDate}T06:00:00Z`, activities: [
      fixed("meal-1", "Breakfast", "MEAL", `${date}T06:30:00Z`, `${date}T07:00:00Z`),
      fixed("exercise-1", "Scheduled exercise", "EXERCISE", `${date}T07:00:00Z`, `${date}T08:00:00Z`),
      fixed("comm-1", "Ground contact", "MISSION", `${date}T08:00:00Z`, `${date}T08:30:00Z`),
      { id: "science-1", title: "Sample inventory", kind: "MISSION", startsAt: `${date}T09:00:00Z`, endsAt: `${date}T09:40:00Z`,
        priority: "NORMAL", movable: true, dependsOn: ["comm-1"], earliestStart: `${date}T09:00:00Z`, latestEnd: `${date}T11:30:00Z` },
      fixed("meal-2", "Lunch", "MEAL", `${date}T12:00:00Z`, `${date}T13:00:00Z`),
      { id: "science-2", title: "Data review", kind: "MISSION", startsAt: `${date}T14:00:00Z`, endsAt: `${date}T14:40:00Z`,
        priority: "LOW", movable: true, dependsOn: [], eligibleAstronautIds: demoCrewMappings.map((member) => member.astronautId), earliestStart: `${date}T14:00:00Z`, latestEnd: `${date}T15:30:00Z` },
      fixed("exercise-2", "Scheduled exercise", "EXERCISE", `${date}T16:00:00Z`, `${date}T17:00:00Z`),
      fixed("meal-3", "Dinner", "MEAL", `${date}T19:00:00Z`, `${date}T20:00:00Z`),
      fixed("sleep-1", "Protected sleep opportunity", "REST", `${date}T21:30:00Z`, `${nextDate}T06:00:00Z`),
    ] });
}

export class DemoProgramProvider extends SimulatedScheduleProvider {
  constructor(private readonly db: PrismaClient, private readonly now: () => Date = () => new Date(),
    private readonly availableCrew: readonly string[] = demoCrewMappings.map((member) => member.astronautId)) { super(db); }
  override async getDay(astronautId: string, date: string): Promise<ScheduleSnapshot> {
    const program = demoProgram(astronautId, date);
    await this.db.scheduleSnapshot.upsert({ where: { astronautId_date: { astronautId, date } }, update: {}, create: {
      id: program.id, astronautId, date, timeZone: program.timeZone, version: 1,
      dayStartsAt: new Date(program.dayStartsAt), dayEndsAt: new Date(program.dayEndsAt), activitiesJson: JSON.stringify(program.activities),
    } });
    return super.getDay(astronautId, date);
  }

  async planReassignment(schedule: ScheduleSnapshot, change: Extract<ProposalCandidate["changes"][number], { type: "REMOVE_ACTIVITY" }>) {
    const activity = schedule.activities.find((item) => item.id === change.activityId);
    const without = { ...change, reassignment: null };
    if (!activity || activity.dependsOn.length || !activity.eligibleAstronautIds?.length) return without;
    const source = applyScheduleChanges(schedule, [without]);
    const duration = Date.parse(activity.endsAt) - Date.parse(activity.startsAt);
    for (const id of activity.eligibleAstronautIds) {
      if (id === schedule.astronautId || !this.availableCrew.includes(id) || !demoCrewMappings.some((member) => member.astronautId === id)) continue;
      const target = await this.getDay(id, schedule.date);
      const peers = await this.db.scheduleSnapshot.findMany({ where: { astronautId: { notIn: [schedule.astronautId, id] },
        dayStartsAt: { lt: new Date(target.dayEndsAt) }, dayEndsAt: { gt: new Date(target.dayStartsAt) } } });
      const startAt = Math.max(Date.parse(activity.startsAt), this.now().getTime(), Date.parse(target.dayStartsAt));
      for (let start = Math.ceil(startAt / 300000) * 300000; start + duration <= Math.min(Date.parse(activity.latestEnd), Date.parse(target.dayEndsAt)); start += 300000) {
        const moved = { ...activity, id: randomUUID(), startsAt: new Date(start).toISOString(), endsAt: new Date(start + duration).toISOString(), dependsOn: [] };
        if (target.activities.some((other) => activitiesOverlap(moved, other))) continue;
        const preview = { ...target, activities: [...target.activities, moved] };
        if (sharedResourceConflicts(preview, [source, ...peers.map(scheduleFromRow)]).length) continue;
        return { ...without, reassignment: { astronautId: id, scheduleId: target.id, expectedVersion: target.version,
          activityId: moved.id, startsAt: moved.startsAt, endsAt: moved.endsAt } };
      }
    }
    return without;
  }

  /** Ground replaces a demo day through an optimistic version check. */
  async replaceDay(astronautId: string, expectedVersion: number, raw: ScheduleSnapshot): Promise<ScheduleSnapshot> {
    const next = ScheduleSnapshotSchema.parse(raw);
    if (next.astronautId !== astronautId || next.version !== expectedVersion) throw new AgentError("VALIDATION_ERROR", "Programma o versione non coerenti.");
    const current = await this.getDay(astronautId, next.date);
    if (current.id !== next.id) throw new AgentError("NOT_FOUND", "Programma non trovato.");
    if (current.version !== expectedVersion) throw new AgentError("VERSION_CONFLICT", "The schedule has changed.", false, current.version);
    const start = Date.parse(next.dayStartsAt), end = Date.parse(next.dayEndsAt);
    const invalid = next.activities.some((activity, i) => Date.parse(activity.startsAt) < start || Date.parse(activity.endsAt) > end
      || activity.dependsOn.some((id) => {
        const dependency = next.activities.find((item) => item.id === id);
        return !dependency || Date.parse(dependency.endsAt) > Date.parse(activity.startsAt);
      }) || next.activities.slice(i + 1).some((other) => activitiesOverlap(activity, other)));
    if (invalid || hasDependencyCycle(next.activities)) throw new AgentError("VALIDATION_ERROR", "The schedule contains activities outside the day, overlapping activities or invalid dependencies.");
    const result = await this.db.$transaction(async (tx) => {
      const peers = await tx.scheduleSnapshot.findMany({ where: { astronautId: { not: astronautId },
        dayStartsAt: { lt: new Date(next.dayEndsAt) }, dayEndsAt: { gt: new Date(next.dayStartsAt) } } });
      const conflicts = sharedResourceConflicts(next, peers.map(scheduleFromRow));
      if (conflicts.length) throw new AgentError("VALIDATION_ERROR", `Shared resource conflict: ${conflicts.join(", ")}.`);
      return tx.scheduleSnapshot.updateMany({ where: { id: current.id, astronautId, version: expectedVersion }, data: {
        version: { increment: 1 }, timeZone: next.timeZone, dayStartsAt: new Date(next.dayStartsAt),
        dayEndsAt: new Date(next.dayEndsAt), activitiesJson: JSON.stringify(next.activities),
      } });
    });
    if (result.count !== 1) {
      const latest = await this.getById(current.id);
      throw new AgentError("VERSION_CONFLICT", "The schedule has changed.", false, latest?.version ?? expectedVersion);
    }
    return { ...next, version: expectedVersion + 1 };
  }

  override async applyApproved(raw: ScheduleApplyCommand): Promise<ScheduleApplyResult> {
    const command = ScheduleApplyCommandSchema.parse(raw);
    const proposal = await this.db.scheduleProposal.findFirst({ where: { id: command.proposalId, astronautId: command.astronautId } });
    const decision = await this.db.proposalDecision.findFirst({ where: { id: command.decisionId, proposalId: command.proposalId, decision: "APPROVE" } });
    if (!proposal || !decision || proposal.decisionId !== decision.id || !["APPROVED", "APPLIED", "APPLY_FAILED"].includes(proposal.status)
        || proposal.scheduleId !== command.scheduleId || proposal.baseScheduleVersion !== command.expectedScheduleVersion
        || JSON.stringify(ProposalCandidateSchema.parse(JSON.parse(proposal.candidateJson)).changes) !== JSON.stringify(command.changes)) {
      return { outcome: "FAILED", retryable: false, reason: "The command does not match a proposal approved by Ground." };
    }
    const receipt = await this.getApplication(command.proposalId, command.decisionId);
    if (receipt.outcome === "APPLIED") return receipt;
    if (command.changes.some((c) => Date.parse(c.startsAt) < this.now().getTime()))
      return { outcome: "FAILED", retryable: false, reason: "The proposed window has already started: a new Ground review is required." };
    if (command.changes.some((c) => c.type === "REMOVE_ACTIVITY" && c.reassignment && Date.parse(c.reassignment.startsAt) < this.now().getTime()))
      return { outcome: "FAILED", retryable: false, reason: "The recipient's proposed window has already started." };
    return super.applyApproved(command);
  }
}
