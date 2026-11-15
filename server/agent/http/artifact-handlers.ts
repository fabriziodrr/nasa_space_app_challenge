import {
  CheckInResponseSchema, ConfirmCheckInRequestSchema, ConfirmCheckInResponseSchema,
  DiaryListResponseSchema, DiaryResponseSchema, IdSchema, ListQuerySchema,
  ReportListResponseSchema, UpdateCheckInRequestSchema, UpdateDiaryRequestSchema,
  type Identity,
} from "../contracts";
import { AgentError } from "../core/errors";
import type { AgentRuntime } from "../runtime";
import { createConversationHttpHandlers, readJson, response } from "./conversation-handlers";
import { z } from "zod";
import { GroundReportSchema } from "../contracts";

const ReportListV2Schema = z.strictObject({
  data: z.strictObject({ items: z.array(GroundReportSchema).max(100), nextCursor: IdSchema.nullable() }),
  meta: z.strictObject({ contractVersion: z.literal("2.0.0"), requestId: IdSchema }),
});

export function createArtifactHttpHandlers(getRuntime: () => AgentRuntime) {
  const { handle } = createConversationHttpHandlers(getRuntime);
  function query(request: Request) {
    const raw: Record<string, string> = {};
    for (const [key, value] of new URL(request.url).searchParams) {
      if (key in raw) throw new AgentError("VALIDATION_ERROR", "Duplicate parameter.");
      raw[key] = value;
    }
    const limit = raw.limit === undefined ? undefined : Number(raw.limit);
    return ListQuerySchema.parse({ ...raw, ...(limit === undefined ? {} : { limit }) });
  }
  function authorize(identity: Identity, astronautId: string, privateOnly: boolean) {
    if (identity.role === "ASTRONAUT") {
      if (identity.astronautId !== astronautId) throw new AgentError("NOT_FOUND", "Resource not found.");
    } else if (privateOnly) throw new AgentError("FORBIDDEN", "Diary restricted to the astronaut.");
    else if (!identity.astronautIds.includes(astronautId)) throw new AgentError("NOT_FOUND", "Resource not found.");
  }
  return {
    updateCheckIn: (request: Request, id: string) => handle(request, async ({ checkIns }, identity, requestId) => {
      const result = await checkIns.update(identity, IdSchema.parse(id), UpdateCheckInRequestSchema.parse(await readJson(request)));
      return response(CheckInResponseSchema, result, requestId);
    }),
    confirm: (request: Request, id: string) => handle(request, async ({ checkIns, artifacts, repository }, identity, requestId) => {
      if (!artifacts) throw new AgentError("PROVIDER_UNAVAILABLE", "Report generation not configured for this provider.");
      const checkIn = await checkIns.confirm(identity, IdSchema.parse(id), ConfirmCheckInRequestSchema.parse(await readJson(request)));
      void artifacts.generate(identity, checkIn.id).catch(() => {});
      const state = await repository.getSessionState(checkIn.astronautId, checkIn.sessionId);
      return response(ConfirmCheckInResponseSchema, state, requestId, 202);
    }),
    reports: (request: Request) => handle(request, async ({ repository }, identity, requestId) => {
      const parsed = query(request); authorize(identity, parsed.astronautId, false);
      const page = await repository.listReports(parsed);
      if (page.items.some((report) => [...report.findings, ...report.discrepancies]
        .some((finding) => finding.source === "vision" || finding.evidence.some((ref) => ref.source === "vision")))) {
        throw new AgentError("INVALID_STATE", "This report requires the /api/agent/v2/reports API.");
      }
      return response(ReportListResponseSchema, page, requestId);
    }),
    reportsV2: (request: Request) => handle(request, async ({ repository }, identity, requestId) => {
      const parsed = query(request); authorize(identity, parsed.astronautId, false);
      const body = ReportListV2Schema.parse({ data: await repository.listReports(parsed), meta: { contractVersion: "2.0.0", requestId } });
      return Response.json(body, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Request-ID": requestId } });
    }),
    diary: (request: Request) => handle(request, async ({ repository }, identity, requestId) => {
      const parsed = query(request); authorize(identity, parsed.astronautId, true);
      return response(DiaryListResponseSchema, await repository.listDiary(parsed.astronautId, parsed.cursor, parsed.limit), requestId);
    }),
    updateDiary: (request: Request, id: string) => handle(request, async ({ repository }, identity, requestId) => {
      if (identity.role !== "ASTRONAUT") throw new AgentError("FORBIDDEN", "Diary restricted to the astronaut.");
      const result = await repository.updateDiary(identity.astronautId, IdSchema.parse(id), UpdateDiaryRequestSchema.parse(await readJson(request)));
      return response(DiaryResponseSchema, result, requestId);
    }),
  };
}
