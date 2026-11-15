// Simulated authoritative program store, backed by Prisma so results survive a
// restart. The apply path performs an atomic version check, mutation and durable
// deduplication by proposal/decision in a single transaction, and replays the same
// successful result for an identical command.
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { ScheduleActivitySchema, type ScheduleApplyCommand, type ScheduleApplyResult, type ScheduleSnapshot } from "../contracts";
import type { ScheduleProvider } from "../ports";
import { AgentErrors } from "../core/errors";
import { activitiesOverlap, applyScheduleChanges } from "../lib/schedule";
import { sharedResourceConflicts } from "../lib/shared-resources";
import { scheduleFromRow, toIso, toJson, type ScheduleRow } from "./prisma/mappers";

export class SimulatedScheduleProvider implements ScheduleProvider {
  constructor(private readonly prisma: PrismaClient) {}

  async getDay(astronautId: string, date: string): Promise<ScheduleSnapshot> {
    const row = await this.prisma.scheduleSnapshot.findUnique({
      where: { astronautId_date: { astronautId, date } },
    });
    if (!row) {
      throw AgentErrors.notFound("Schedule not found for the requested astronaut and date.");
    }
    return scheduleFromRow(row);
  }

  async getById(scheduleId: string): Promise<ScheduleSnapshot | null> {
    const row = await this.prisma.scheduleSnapshot.findUnique({ where: { id: scheduleId } });
    return row ? scheduleFromRow(row) : null;
  }

  async findSharedResourceConflicts(schedule: ScheduleSnapshot): Promise<string[]> {
    const rows = await this.prisma.scheduleSnapshot.findMany({ where: { astronautId: { not: schedule.astronautId },
      dayStartsAt: { lt: new Date(schedule.dayEndsAt) }, dayEndsAt: { gt: new Date(schedule.dayStartsAt) } } });
    return sharedResourceConflicts(schedule, rows.map(scheduleFromRow));
  }

  async applyApproved(command: ScheduleApplyCommand): Promise<ScheduleApplyResult> {
    const commandJson = toJson(command);
    return this.prisma.$transaction(async (tx) => {
      const receipt = await tx.scheduleApplication.findUnique({
        where: {
          proposalId_decisionId: { proposalId: command.proposalId, decisionId: command.decisionId },
        },
      });
      if (receipt) {
        if (receipt.commandJson !== commandJson) {
          return {
            outcome: "FAILED",
            retryable: false,
            reason: "Reconciliation: different command for the same proposal/decision pair.",
          } satisfies ScheduleApplyResult;
        }
        const schedule = await tx.scheduleSnapshot.findUnique({ where: { id: receipt.scheduleId } });
        return this.#appliedResult(
          schedule,
          receipt.resultingVersion,
          receipt.resultingActivitiesJson,
          receipt.appliedAt,
        );
      }

      const schedule = await tx.scheduleSnapshot.findUnique({ where: { id: command.scheduleId } });
      if (!schedule || schedule.astronautId !== command.astronautId) {
        return {
          outcome: "FAILED",
          retryable: false,
          reason: "Schedule not found or not belonging to the astronaut.",
        } satisfies ScheduleApplyResult;
      }
      if (schedule.version !== command.expectedScheduleVersion) {
        return { outcome: "STALE", currentVersion: schedule.version } satisfies ScheduleApplyResult;
      }

      const current = scheduleFromRow(schedule);
      const removal = command.changes.find((change) => change.type === "REMOVE_ACTIVITY");
      let targetUpdate: ScheduleSnapshot | null = null;
      if (removal) {
        const activity = current.activities.find((item) => item.id === removal.activityId);
        if (command.changes.length !== 1 || !activity || activity.kind !== "MISSION" || !activity.movable || activity.priority === "CRITICAL"
          || activity.dependsOn.length > 0 || current.activities.some((item) => item.dependsOn.includes(activity.id))
          || Date.parse(activity.startsAt) !== Date.parse(removal.startsAt) || Date.parse(activity.endsAt) !== Date.parse(removal.endsAt))
          return { outcome: "FAILED", retryable: false, reason: "Activity is no longer eligible for removal." } satisfies ScheduleApplyResult;
        if (removal.reassignment) {
          const target = removal.reassignment;
          const targetRow = await tx.scheduleSnapshot.findUnique({ where: { id: target.scheduleId } });
          if (!targetRow || targetRow.astronautId !== target.astronautId || target.astronautId === current.astronautId
            || targetRow.version !== target.expectedVersion || !activity.eligibleAstronautIds?.includes(target.astronautId))
            return { outcome: "FAILED", retryable: false, reason: "Recipient availability or eligibility has changed." } satisfies ScheduleApplyResult;
          const recipient = scheduleFromRow(targetRow);
          const moved = { ...activity, id: target.activityId, startsAt: target.startsAt, endsAt: target.endsAt, dependsOn: [] };
          if (recipient.activities.some((item) => item.id === moved.id || activitiesOverlap(item, moved))
            || Date.parse(moved.startsAt) < Date.parse(activity.earliestStart) || Date.parse(moved.endsAt) > Date.parse(activity.latestEnd)
            || Date.parse(moved.startsAt) < Date.parse(recipient.dayStartsAt) || Date.parse(moved.endsAt) > Date.parse(recipient.dayEndsAt)
            || Date.parse(moved.endsAt) - Date.parse(moved.startsAt) !== Date.parse(activity.endsAt) - Date.parse(activity.startsAt))
            return { outcome: "FAILED", retryable: false, reason: "Recipient schedule no longer accommodates this activity." } satisfies ScheduleApplyResult;
          targetUpdate = { ...recipient, version: recipient.version + 1, activities: [...recipient.activities, moved] };
        }
      }
      const next = applyScheduleChanges(current, command.changes);
      const peers = await tx.scheduleSnapshot.findMany({ where: { astronautId: { not: current.astronautId },
        dayStartsAt: { lt: new Date(current.dayEndsAt) }, dayEndsAt: { gt: new Date(current.dayStartsAt) } } });
      const otherSchedules = peers.map(scheduleFromRow).filter((item) => item.id !== targetUpdate?.id);
      const conflicts = [...new Set([...sharedResourceConflicts(next, [...otherSchedules, ...(targetUpdate ? [targetUpdate] : [])]),
        ...(targetUpdate ? sharedResourceConflicts(targetUpdate, [next, ...otherSchedules]) : [])])];
      if (conflicts.length) return { outcome: "FAILED", retryable: false,
        reason: `Shared resource conflict: ${conflicts.join(", ")}.` } satisfies ScheduleApplyResult;
      const appliedAt = new Date();
      await tx.scheduleSnapshot.update({
        where: { id: command.scheduleId },
        data: { version: next.version, activitiesJson: toJson(next.activities) },
      });
      if (targetUpdate) await tx.scheduleSnapshot.update({ where: { id: targetUpdate.id },
        data: { version: targetUpdate.version, activitiesJson: toJson(targetUpdate.activities) } });
      await tx.scheduleApplication.create({
        data: {
          proposalId: command.proposalId,
          decisionId: command.decisionId,
          scheduleId: command.scheduleId,
          appliedAt,
          resultingVersion: next.version,
          resultingActivitiesJson: toJson(next.activities),
          commandJson,
        },
      });
      return {
        outcome: "APPLIED",
        schedule: next,
        appliedAt: toIso(appliedAt),
      } satisfies ScheduleApplyResult;
    });
  }

  async getApplication(proposalId: string, decisionId: string): Promise<ScheduleApplyResult> {
    const receipt = await this.prisma.scheduleApplication.findUnique({
      where: { proposalId_decisionId: { proposalId, decisionId } },
    });
    if (!receipt) return { outcome: "UNKNOWN" };
    const schedule = await this.prisma.scheduleSnapshot.findUnique({ where: { id: receipt.scheduleId } });
    return this.#appliedResult(
      schedule,
      receipt.resultingVersion,
      receipt.resultingActivitiesJson,
      receipt.appliedAt,
    );
  }

  #appliedResult(
    schedule: ScheduleRow | null,
    version: number,
    activitiesJson: string,
    appliedAt: Date,
  ): ScheduleApplyResult {
    if (!schedule) return { outcome: "UNKNOWN" };
    const snapshot = scheduleFromRow(schedule);
    const activities = z.array(ScheduleActivitySchema).parse(JSON.parse(activitiesJson));
    return {
      outcome: "APPLIED",
      schedule: { ...snapshot, version, activities },
      appliedAt: toIso(appliedAt),
    };
  }
}
