import { z } from "zod";
import { DecideProposalRequestSchema, DecisionV2ResponseSchema, IdSchema, ListQuerySchema, ProposalListV2ResponseSchema, ScheduleQuerySchema, ScheduleV2ResponseSchema, UpdateScheduleRequestSchema, type Identity } from "../contracts";
import { AgentError } from "../core/errors";
import type { AgentRuntime } from "../runtime";
import { createConversationHttpHandlers, readJson } from "./conversation-handlers";

function reply<S extends z.ZodType>(schema: S, data: unknown, requestId: string) {
  const parsed = schema.safeParse({ data, meta: { contractVersion: "2.0.0", requestId } });
  if (!parsed.success) throw new AgentError("INTERNAL_ERROR", "Invalid service response.");
  return Response.json(parsed.data, {
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Request-ID": requestId },
  });
}
function authorize(identity: Identity, astronautId: string) {
  if (identity.role === "ASTRONAUT" ? identity.astronautId !== astronautId : !identity.astronautIds.includes(astronautId))
    throw new AgentError("NOT_FOUND", "Resource not found.");
}
function query(request: Request) {
  const result: Record<string, string> = {};
  for (const [key, value] of new URL(request.url).searchParams) {
    if (Object.hasOwn(result, key)) throw new AgentError("VALIDATION_ERROR", "Duplicate parameter.");
    result[key] = value;
  }
  return result;
}
export function createProposalHttpHandlers(getRuntime: () => AgentRuntime) {
  const { handle } = createConversationHttpHandlers(getRuntime);
  return {
    list: (request: Request) => handle(request, async ({ repository }, identity, requestId) => {
      const raw = query(request);
      const input = ListQuerySchema.parse({ ...raw, ...(raw.limit === undefined ? {} : { limit: Number(raw.limit) }) });
      authorize(identity, input.astronautId);
      return reply(ProposalListV2ResponseSchema, await repository.listProposals(input), requestId);
    }),
    decide: (request: Request, proposalId: string) => handle(request, async ({ approval }, identity, requestId) => {
      if (identity.role !== "GROUND_CONTROL") throw new AgentError("FORBIDDEN", "The decision belongs to ground control.");
      const result = await approval.decide({ identity, proposalId: IdSchema.parse(proposalId),
        idempotencyKey: IdSchema.parse(request.headers.get("idempotency-key")), request: DecideProposalRequestSchema.parse(await readJson(request)) });
      return reply(DecisionV2ResponseSchema, result, requestId);
    }),
    schedule: (request: Request) => handle(request, async ({ schedule }, identity, requestId) => {
      const input = ScheduleQuerySchema.parse(query(request));
      authorize(identity, input.astronautId);
      return reply(ScheduleV2ResponseSchema, await schedule.getDay(input.astronautId, input.date), requestId);
    }),
    updateSchedule: (request: Request) => handle(request, async ({ schedule }, identity, requestId) => {
      if (identity.role !== "GROUND_CONTROL") throw new AgentError("FORBIDDEN", "Solo Terra può impostare il programma.");
      const input = UpdateScheduleRequestSchema.parse(await readJson(request));
      authorize(identity, input.schedule.astronautId);
      return reply(ScheduleV2ResponseSchema, await schedule.replaceDay(input.schedule.astronautId, input.expectedVersion, input.schedule), requestId);
    }),
  };
}
