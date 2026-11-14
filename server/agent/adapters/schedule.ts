// Simulated authoritative program store, backed by Prisma so results survive a
// restart. The apply path performs an atomic version check, mutation and durable
// deduplication by proposal/decision in a single transaction, and replays the same
// successful result for an identical command.
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { ScheduleActivitySchema, type ScheduleApplyCommand, type ScheduleApplyResult, type ScheduleSnapshot } from "../contracts";
import type { ScheduleProvider } from "../ports";
import { AgentErrors } from "../core/errors";
import { applyScheduleChanges } from "../lib/schedule";
import { scheduleFromRow, toIso, toJson, type ScheduleRow } from "./prisma/mappers";

export class SimulatedScheduleProvider implements ScheduleProvider {
  constructor(private readonly prisma: PrismaClient) {}

  async getDay(astronautId: string, date: string): Promise<ScheduleSnapshot> {
    const row = await this.prisma.scheduleSnapshot.findUnique({
      where: { astronautId_date: { astronautId, date } },
    });
    if (!row) {
      throw AgentErrors.notFound("Programma non trovato per l'astronauta e la data richiesti.");
    }
    return scheduleFromRow(row);
  }

  async getById(scheduleId: string): Promise<ScheduleSnapshot | null> {
    const row = await this.prisma.scheduleSnapshot.findUnique({ where: { id: scheduleId } });
    return row ? scheduleFromRow(row) : null;
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
            reason: "Riconciliazione: comando differente per la stessa coppia proposta/decisione.",
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
          reason: "Programma non trovato o non appartenente all'astronauta.",
        } satisfies ScheduleApplyResult;
      }
      if (schedule.version !== command.expectedScheduleVersion) {
        return { outcome: "STALE", currentVersion: schedule.version } satisfies ScheduleApplyResult;
      }

      const current = scheduleFromRow(schedule);
      const next = applyScheduleChanges(current, command.changes);
      const appliedAt = new Date();
      await tx.scheduleSnapshot.update({
        where: { id: command.scheduleId },
        data: { version: next.version, activitiesJson: toJson(next.activities) },
      });
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
