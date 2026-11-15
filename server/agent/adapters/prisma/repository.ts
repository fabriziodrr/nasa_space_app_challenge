// Prisma-backed implementation of the AgentRepository port. Every lookup is
// astronaut-scoped; services authorize the identity before calling these methods.
// Atomic operations run inside a SQLite transaction with compare-and-swap on the
// revision/version fields. No network or AI calls happen inside transactions.
import { Prisma, type PrismaClient } from "@prisma/client";
import {
  type CheckIn, type ConversationMessage, type ConversationSession,
  type DecideProposalRequest, type DiaryEntry, type GroundReport, type ListQuery,
  type MessageResult, type ProposalDecision, type ScheduleApplyResult,
  type ScheduleProposal, type SendMessageRequest, type SessionState,
  type UpdateCheckInRequest, type UpdateDiaryRequest,
} from "../../contracts";
import type {
  AgentRepository, GenerationArtifacts, GenerationClaim, Page,
} from "../../ports";
import { AgentErrors } from "../../core/errors";
import { randomId } from "../../lib/id";
import {
  checkInFromRow, decisionFromRow, diaryFromRow, messageFromRow,
  proposalFromRow, reportFromRow, sessionFromRow, toDate, toIso, toJson,
} from "./mappers";

const MESSAGES_PAGE = 200;

export class PrismaAgentRepository implements AgentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createSession(session: ConversationSession): Promise<ConversationSession> {
    await this.prisma.conversationSession.create({
      data: {
        id: session.id,
        astronautId: session.astronautId,
        openedAt: toDate(session.openedAt),
        closedAt: session.closedAt ? toDate(session.closedAt) : null,
      },
    });
    return session;
  }

  async getSessionState(
    astronautId: string,
    sessionId: string,
    beforeMessageId?: string,
  ): Promise<SessionState | null> {
    const session = await this.prisma.conversationSession.findUnique({ where: { id: sessionId } });
    if (!session || session.astronautId !== astronautId) return null;

    const { items, nextMessageCursor } = await this.#loadMessages(sessionId, beforeMessageId);
    const checkInRow = await this.prisma.checkIn.findUnique({ where: { sessionId } });
    const checkIn = checkInRow ? checkInFromRow(checkInRow) : null;

    let generationStatus: SessionState["generationStatus"] = "NOT_STARTED";
    let reportId: string | null = null;
    let diaryEntryId: string | null = null;
    let proposal: ScheduleProposal | null = null;
    let noChangeReason: string | null = null;

    if (checkIn && checkIn.status === "CONFIRMED") {
      const [report, diary, proposalRow, claim] = await Promise.all([
        this.prisma.groundReport.findUnique({ where: { checkInId: checkIn.id } }),
        this.prisma.diaryEntry.findUnique({ where: { checkInId: checkIn.id } }),
        this.prisma.scheduleProposal.findUnique({ where: { checkInId: checkIn.id } }),
        this.prisma.generationClaim.findUnique({ where: { checkInId: checkIn.id } }),
      ]);
      if (report && diary) {
        generationStatus = "READY";
        reportId = report.id;
        diaryEntryId = diary.id;
        proposal = proposalRow ? proposalFromRow(proposalRow) : null;
        noChangeReason = claim?.noChangeReason ?? null;
      } else if (claim?.failed) {
        generationStatus = "FAILED";
      } else if (claim && claim.leaseExpiresAt.getTime() > Date.now() && !claim.completedAt) {
        generationStatus = "PROCESSING";
      }
    }

    return {
      session: sessionFromRow(session),
      messages: items,
      nextMessageCursor,
      checkIn,
      generationStatus,
      reportId,
      diaryEntryId,
      proposal,
      noChangeReason,
    };
  }

  async #loadMessages(
    sessionId: string,
    beforeMessageId?: string,
  ): Promise<{ items: ConversationMessage[]; nextMessageCursor: string | null }> {
    let where: Prisma.ConversationMessageWhereInput = { sessionId };
    if (beforeMessageId) {
      const cursor = await this.prisma.conversationMessage.findUnique({ where: { id: beforeMessageId } });
      if (!cursor || cursor.sessionId !== sessionId) {
        throw AgentErrors.notFound("Cursor message not found in this session.");
      }
      where = {
        sessionId,
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      };
    }
    const rows = await this.prisma.conversationMessage.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: MESSAGES_PAGE + 1,
    });
    const hasMore = rows.length > MESSAGES_PAGE;
    const page = rows.slice(0, MESSAGES_PAGE).reverse();
    return { items: page.map(messageFromRow), nextMessageCursor: hasMore ? page[0].id : null };
  }

  async getTurn(
    astronautId: string,
    sessionId: string,
    clientMessageId: string,
  ): Promise<{ request: SendMessageRequest; result: MessageResult } | null> {
    const turn = await this.prisma.turn.findUnique({ where: { clientMessageId } });
    if (!turn || turn.sessionId !== sessionId || turn.astronautId !== astronautId) return null;
    return {
      request: JSON.parse(turn.requestJson) as SendMessageRequest,
      result: JSON.parse(turn.resultJson) as MessageResult,
    };
  }

  async commitTurn(input: {
    astronautId: string;
    sessionId: string;
    request: SendMessageRequest;
    expectedCheckInRevision: number | null;
    result: MessageResult;
  }): Promise<MessageResult> {
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.conversationSession.findUnique({ where: { id: input.sessionId } });
      if (!session || session.astronautId !== input.astronautId) {
        throw AgentErrors.notFound("Sessione non trovata o non accessibile.");
      }

      const existing = await tx.turn.findUnique({ where: { clientMessageId: input.request.clientMessageId } });
      if (existing) {
        if (existing.requestJson === toJson(input.request) && existing.resultJson === toJson(input.result)) {
          return JSON.parse(existing.resultJson) as MessageResult;
        }
        throw AgentErrors.idempotencyConflict();
      }

      const newRevision = input.expectedCheckInRevision === null
        ? 1
        : input.expectedCheckInRevision + 1;
      const existingCheckIn = await tx.checkIn.findUnique({ where: { sessionId: input.sessionId } });
      if (input.expectedCheckInRevision === null) {
        if (existingCheckIn) throw AgentErrors.invalidState("Esiste gia una bozza per questa sessione.");
      } else {
        if (!existingCheckIn) throw AgentErrors.invalidState("Nessuna bozza da aggiornare per questa sessione.");
        if (existingCheckIn.status !== "DRAFT") throw AgentErrors.invalidState("Il check-in non e piu in bozza.");
        if (existingCheckIn.revision !== input.expectedCheckInRevision) {
          throw AgentErrors.versionConflict("La bozza e cambiata nel frattempo.", existingCheckIn.revision);
        }
      }
      const draft = input.result.checkIn;
      if (draft.revision !== newRevision || draft.status !== "DRAFT") {
        throw AgentErrors.internal("Revisione o stato incoerenti nel turno restituito.");
      }

      if (existingCheckIn) {
        if (draft.id !== existingCheckIn.id) throw AgentErrors.internal("Identita della bozza incoerente.");
        await tx.checkIn.update({
          where: { id: existingCheckIn.id },
          data: {
            revision: draft.revision,
            observationsJson: toJson(draft.observations),
            sharedObservationIdsJson: toJson(draft.sharedObservationIds),
          },
        });
      } else {
        await tx.checkIn.create({
          data: {
            id: draft.id,
            astronautId: input.astronautId,
            sessionId: input.sessionId,
            revision: draft.revision,
            status: "DRAFT",
            observationsJson: toJson(draft.observations),
            sharedObservationIdsJson: toJson(draft.sharedObservationIds),
            createdAt: toDate(draft.createdAt),
            confirmedAt: null,
          },
        });
      }

      const { astronautMessage, assistantMessage } = input.result;
      await tx.conversationMessage.createMany({
        data: [astronautMessage, assistantMessage].map((m) => ({
          id: m.id,
          sessionId: input.sessionId,
          role: m.role,
          text: m.text,
          createdAt: toDate(m.createdAt),
          inputMode: m.inputMode,
        })),
      });
      await tx.turn.create({
        data: {
          clientMessageId: input.request.clientMessageId,
          sessionId: input.sessionId,
          astronautId: input.astronautId,
          requestJson: toJson(input.request),
          resultJson: toJson(input.result),
          createdAt: new Date(),
        },
      });

      return input.result;
    });
  }

  async getCheckIn(astronautId: string, checkInId: string): Promise<CheckIn | null> {
    const row = await this.prisma.checkIn.findUnique({ where: { id: checkInId } });
    if (!row || row.astronautId !== astronautId) return null;
    return checkInFromRow(row);
  }

  async listPreviousCheckIns(astronautId: string, limit: number): Promise<CheckIn[]> {
    const rows = await this.prisma.checkIn.findMany({
      where: { astronautId, status: "CONFIRMED" },
      orderBy: [{ confirmedAt: "desc" }, { id: "desc" }],
      take: limit,
    });
    return rows.map(checkInFromRow);
  }

  async updateCheckIn(
    astronautId: string,
    checkInId: string,
    request: UpdateCheckInRequest,
  ): Promise<CheckIn> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.checkIn.findUnique({ where: { id: checkInId } });
      if (!row || row.astronautId !== astronautId) throw AgentErrors.notFound();
      if (row.status !== "DRAFT") throw AgentErrors.invalidState("Il check-in confermato non puo essere corretto.");
      if (row.revision !== request.expectedRevision) {
        throw AgentErrors.versionConflict("La bozza e cambiata nel frattempo.", row.revision);
      }
      const updated = await tx.checkIn.update({
        where: { id: checkInId },
        data: { revision: row.revision + 1, observationsJson: toJson(request.observations) },
      });
      return checkInFromRow(updated);
    });
  }

  async confirmCheckIn(
    astronautId: string,
    checkInId: string,
    request: { expectedRevision: number; sharedObservationIds: string[] },
  ): Promise<CheckIn> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.checkIn.findUnique({ where: { id: checkInId } });
      if (!row || row.astronautId !== astronautId) throw AgentErrors.notFound();
      if (row.status === "CONFIRMED") {
        const sameSelection = toJson(JSON.parse(row.sharedObservationIdsJson) as string[])
          === toJson(request.sharedObservationIds);
        const sameBaseRevision = row.revision === request.expectedRevision + 1;
        if (sameSelection && sameBaseRevision) return checkInFromRow(row);
        throw AgentErrors.invalidState("Selezione condivisa o revisione diverse da una conferma gia registrata.");
      }
      if (row.revision !== request.expectedRevision) {
        throw AgentErrors.versionConflict("La bozza e cambiata nel frattempo.", row.revision);
      }
      const updated = await tx.checkIn.update({
        where: { id: checkInId },
        data: {
          status: "CONFIRMED",
          revision: row.revision + 1,
          sharedObservationIdsJson: toJson(request.sharedObservationIds),
          confirmedAt: new Date(),
        },
      });
      return checkInFromRow(updated);
    });
  }

  async claimGeneration(
    astronautId: string,
    checkInId: string,
    leaseMs: number,
  ): Promise<GenerationClaim | null> {
    return this.prisma.$transaction(async (tx) => {
      const checkIn = await tx.checkIn.findUnique({ where: { id: checkInId } });
      if (!checkIn || checkIn.astronautId !== astronautId) throw AgentErrors.notFound();
      if (checkIn.status !== "CONFIRMED") throw AgentErrors.invalidState("Il check-in non e confermato.");
      const existing = await tx.generationClaim.findUnique({ where: { checkInId } });
      if (existing?.completedAt) return null;
      if (existing && !existing.failed && existing.leaseExpiresAt.getTime() > Date.now()) return null;
      const token = randomId("claim");
      const leaseExpiresAt = new Date(Date.now() + leaseMs);
      await tx.generationClaim.upsert({
        where: { checkInId },
        create: { checkInId, token, leaseExpiresAt, failed: false },
        update: { token, leaseExpiresAt, failed: false },
      });
      return { checkInId, token, leaseExpiresAt: toIso(leaseExpiresAt) };
    });
  }

  async completeGeneration(claim: GenerationClaim, artifacts: GenerationArtifacts): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.generationClaim.findUnique({ where: { checkInId: claim.checkInId } });
      if (!existing || existing.token !== claim.token) {
        throw AgentErrors.invalidState("Lease di generazione non valida o scaduta.");
      }
      if (existing.completedAt) return;
      if (existing.leaseExpiresAt.getTime() <= Date.now()) {
        throw AgentErrors.invalidState("Lease di generazione scaduta.");
      }

      const checkIn = await tx.checkIn.findUnique({ where: { id: claim.checkInId } });
      if (!checkIn) throw AgentErrors.notFound();
      this.#assertArtifactsScope(claim.checkInId, checkIn.astronautId, artifacts);

      const report = artifacts.report;
      await tx.groundReport.create({
        data: {
          id: report.id,
          astronautId: report.astronautId,
          checkInId: report.checkInId,
          generatedAt: toDate(report.generatedAt),
          findingsJson: toJson(report.findings),
          discrepanciesJson: toJson(report.discrepancies),
          uncertaintiesJson: toJson(report.uncertainties),
          humanReviewRequired: report.humanReview.required,
          humanReviewReason: report.humanReview.reason,
          proposalId: report.proposalId,
        },
      });
      const diary = artifacts.diary;
      await tx.diaryEntry.create({
        data: {
          id: diary.id,
          astronautId: diary.astronautId,
          checkInId: diary.checkInId,
          date: diary.date,
          text: diary.text,
          revision: diary.revision,
          status: diary.status,
          visibility: diary.visibility,
          updatedAt: toDate(diary.updatedAt),
        },
      });
      if (artifacts.proposal) {
        const proposal = artifacts.proposal;
        await tx.scheduleProposal.create({
          data: {
            id: proposal.id,
            astronautId: proposal.astronautId,
            checkInId: proposal.checkInId,
            scheduleId: proposal.scheduleId,
            baseScheduleVersion: proposal.baseScheduleVersion,
            createdAt: toDate(proposal.createdAt),
            candidateJson: toJson(proposal.candidate),
            status: proposal.status,
            decisionId: proposal.decisionId,
            appliedScheduleVersion: proposal.appliedScheduleVersion,
            appliedAt: proposal.appliedAt ? toDate(proposal.appliedAt) : null,
          },
        });
      }
      await tx.generationClaim.update({
        where: { checkInId: claim.checkInId },
        data: { completedAt: new Date(), failed: false, noChangeReason: artifacts.noChangeReason },
      });
    });
  }

  #assertArtifactsScope(checkInId: string, astronautId: string, artifacts: GenerationArtifacts): void {
    const { report, diary, proposal } = artifacts;
    if (report.checkInId !== checkInId || report.astronautId !== astronautId) {
      throw AgentErrors.internal("Report incoerente con il check-in.");
    }
    if (diary.checkInId !== checkInId || diary.astronautId !== astronautId) {
      throw AgentErrors.internal("Diario incoerente con il check-in.");
    }
    if (proposal && (proposal.checkInId !== checkInId || proposal.astronautId !== astronautId)) {
      throw AgentErrors.internal("Proposta incoerente con il check-in.");
    }
    if ((proposal === null) === (artifacts.noChangeReason === null)) {
      throw AgentErrors.internal("Deve esistere una proposta oppure una motivazione esplicita, mai entrambe.");
    }
  }

  async failGeneration(claim: GenerationClaim): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.generationClaim.findUnique({ where: { checkInId: claim.checkInId } });
      if (!existing || existing.token !== claim.token) throw AgentErrors.invalidState("Lease non valida.");
      if (existing.completedAt) return;
      await tx.generationClaim.update({ where: { checkInId: claim.checkInId }, data: { failed: true } });
    });
  }

  async getProposal(astronautId: string, proposalId: string): Promise<ScheduleProposal | null> {
    const row = await this.prisma.scheduleProposal.findUnique({ where: { id: proposalId } });
    if (!row || row.astronautId !== astronautId) return null;
    return proposalFromRow(row);
  }

  async listProposals(query: ListQuery): Promise<Page<ScheduleProposal>> {
    return this.#paginateProposals(query);
  }

  async #paginateProposals(query: ListQuery): Promise<Page<ScheduleProposal>> {
    const cursor = query.cursor
      ? await this.prisma.scheduleProposal.findUnique({ where: { id: query.cursor } })
      : null;
    if (query.cursor && (!cursor || cursor.astronautId !== query.astronautId)) {
      return { items: [], nextCursor: null };
    }
    const where: Prisma.ScheduleProposalWhereInput = cursor
      ? {
          astronautId: query.astronautId,
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }
      : { astronautId: query.astronautId };
    const rows = await this.prisma.scheduleProposal.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
    });
    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    return { items: page.map(proposalFromRow), nextCursor: hasMore ? page[page.length - 1].id : null };
  }

  async recordDecision(input: {
    astronautId: string;
    proposalId: string;
    operatorId: string;
    idempotencyKey: string;
    request: DecideProposalRequest;
  }): Promise<{ proposal: ScheduleProposal; decision: ProposalDecision }> {
    return this.prisma.$transaction(async (tx) => {
      const proposal = await tx.scheduleProposal.findUnique({ where: { id: input.proposalId } });
      if (!proposal || proposal.astronautId !== input.astronautId) throw AgentErrors.notFound();

      const existingDecision = await tx.proposalDecision.findUnique({
        where: { proposalId: input.proposalId },
      });
      if (existingDecision) {
        const sameKey = existingDecision.idempotencyKey === input.idempotencyKey;
        const samePayload = existingDecision.decision === input.request.decision
          && existingDecision.comment === input.request.comment
          && existingDecision.operatorId === input.operatorId;
        if (sameKey && samePayload) {
          return { proposal: proposalFromRow(proposal), decision: decisionFromRow(existingDecision) };
        }
        if (sameKey) throw AgentErrors.idempotencyConflict();
        throw AgentErrors.invalidState("Una decisione per questa proposta e gia registrata.");
      }

      if (proposal.status !== "PENDING_REVIEW") {
        throw AgentErrors.invalidState("La proposta non e in attesa di decisione.");
      }
      const decision = await tx.proposalDecision.create({
        data: {
          id: randomId("decision"),
          proposalId: input.proposalId,
          operatorId: input.operatorId,
          decision: input.request.decision,
          comment: input.request.comment,
          decidedAt: new Date(),
          idempotencyKey: input.idempotencyKey,
        },
      });
      const updated = await tx.scheduleProposal.update({
        where: { id: input.proposalId },
        data: { status: input.request.decision === "APPROVE" ? "APPROVED" : "REJECTED", decisionId: decision.id },
      });
      return { proposal: proposalFromRow(updated), decision: decisionFromRow(decision) };
    });
  }

  async recordApplication(input: {
    astronautId: string;
    proposalId: string;
    decisionId: string;
    result: ScheduleApplyResult;
  }): Promise<ScheduleProposal> {
    return this.prisma.$transaction(async (tx) => {
      const proposal = await tx.scheduleProposal.findUnique({ where: { id: input.proposalId } });
      if (!proposal || proposal.astronautId !== input.astronautId) throw AgentErrors.notFound();
      if (proposal.decisionId !== input.decisionId) throw AgentErrors.invalidState("Decisione non coerente con la proposta.");

      const result = input.result;
      if (result.outcome === "APPLIED") {
        if (proposal.status === "APPLIED") return proposalFromRow(proposal);
        if (proposal.status !== "APPROVED") throw AgentErrors.invalidState("Transizione non consentita verso APPLIED.");
        const updated = await tx.scheduleProposal.update({
          where: { id: input.proposalId },
          data: {
            status: "APPLIED",
            appliedScheduleVersion: result.schedule.version,
            appliedAt: toDate(result.appliedAt),
          },
        });
        return proposalFromRow(updated);
      }
      if (result.outcome === "STALE") {
        if (proposal.status === "STALE") return proposalFromRow(proposal);
        if (proposal.status !== "APPROVED" && proposal.status !== "APPLY_FAILED") {
          throw AgentErrors.invalidState("Transizione non consentita verso STALE.");
        }
        const updated = await tx.scheduleProposal.update({
          where: { id: input.proposalId },
          data: { status: "STALE" },
        });
        return proposalFromRow(updated);
      }
      if (result.outcome === "FAILED") {
        if (proposal.status === "APPLY_FAILED") return proposalFromRow(proposal);
        if (proposal.status !== "APPROVED") throw AgentErrors.invalidState("Transizione non consentita verso APPLY_FAILED.");
        const updated = await tx.scheduleProposal.update({
          where: { id: input.proposalId },
          data: { status: "APPLY_FAILED" },
        });
        return proposalFromRow(updated);
      }
      // UNKNOWN: keep APPROVED so reconciliation can continue later.
      return proposalFromRow(proposal);
    });
  }

  async markProposalStale(astronautId: string, proposalId: string): Promise<ScheduleProposal> {
    return this.prisma.$transaction(async (tx) => {
      const proposal = await tx.scheduleProposal.findUnique({ where: { id: proposalId } });
      if (!proposal || proposal.astronautId !== astronautId) throw AgentErrors.notFound();
      if (proposal.status === "STALE") return proposalFromRow(proposal);
      if (!["PENDING_REVIEW", "APPROVED", "APPLY_FAILED"].includes(proposal.status)) {
        throw AgentErrors.invalidState("Transizione non consentita verso STALE.");
      }
      const updated = await tx.scheduleProposal.update({
        where: { id: proposalId },
        data: { status: "STALE" },
      });
      return proposalFromRow(updated);
    });
  }

  async listReports(query: ListQuery): Promise<Page<GroundReport>> {
    const cursor = query.cursor
      ? await this.prisma.groundReport.findUnique({ where: { id: query.cursor } })
      : null;
    if (query.cursor && (!cursor || cursor.astronautId !== query.astronautId)) {
      return { items: [], nextCursor: null };
    }
    const where: Prisma.GroundReportWhereInput = cursor
      ? {
          astronautId: query.astronautId,
          OR: [
            { generatedAt: { lt: cursor.generatedAt } },
            { generatedAt: cursor.generatedAt, id: { lt: cursor.id } },
          ],
        }
      : { astronautId: query.astronautId };
    const rows = await this.prisma.groundReport.findMany({
      where,
      orderBy: [{ generatedAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
    });
    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    return { items: page.map(reportFromRow), nextCursor: hasMore ? page[page.length - 1].id : null };
  }

  async listDiary(astronautId: string, cursor?: string, limit = 20): Promise<Page<DiaryEntry>> {
    const cursorRow = cursor ? await this.prisma.diaryEntry.findUnique({ where: { id: cursor } }) : null;
    if (cursor && (!cursorRow || cursorRow.astronautId !== astronautId)) {
      return { items: [], nextCursor: null };
    }
    const where: Prisma.DiaryEntryWhereInput = cursorRow
      ? {
          astronautId,
          OR: [
            { updatedAt: { lt: cursorRow.updatedAt } },
            { updatedAt: cursorRow.updatedAt, id: { lt: cursorRow.id } },
          ],
        }
      : { astronautId };
    const rows = await this.prisma.diaryEntry.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    return { items: page.map(diaryFromRow), nextCursor: hasMore ? page[page.length - 1].id : null };
  }

  async updateDiary(
    astronautId: string,
    diaryId: string,
    request: UpdateDiaryRequest,
  ): Promise<DiaryEntry> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.diaryEntry.findUnique({ where: { id: diaryId } });
      if (!row || row.astronautId !== astronautId) throw AgentErrors.notFound();
      if (row.revision !== request.expectedRevision) {
        throw AgentErrors.versionConflict("La voce del diario e cambiata nel frattempo.", row.revision);
      }
      const updated = await tx.diaryEntry.update({
        where: { id: diaryId },
        data: { revision: row.revision + 1, text: request.text, status: request.status, updatedAt: new Date() },
      });
      return diaryFromRow(updated);
    });
  }
}
