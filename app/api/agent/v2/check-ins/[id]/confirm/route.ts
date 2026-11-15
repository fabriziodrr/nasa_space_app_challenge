import { randomUUID } from "node:crypto";
import { z } from "zod";
import { CheckInSchema, ConfirmCheckInWithVisionRequestSchema, IdSchema, VisionSelectionSchema } from "@/server/agent/contracts";
import { AgentError } from "@/server/agent/core/errors";
import { createConversationHttpHandlers, readJson } from "@/server/agent/http/conversation-handlers";
import { getAgentRuntime } from "@/server/agent/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const Reply = z.strictObject({ data: z.strictObject({ checkIn: CheckInSchema, vision: VisionSelectionSchema }),
  meta: z.strictObject({ contractVersion: z.literal("2.0.0"), requestId: IdSchema }) });
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { handle } = createConversationHttpHandlers(getAgentRuntime);
  return handle(request, async ({ visionConfirmation, artifacts }, identity) => {
    if (identity.role !== "ASTRONAUT") throw new AgentError("FORBIDDEN", "Funzione riservata all'astronauta.");
    if (!artifacts) throw new AgentError("PROVIDER_UNAVAILABLE", "Report generation is not configured.");
    const result = await visionConfirmation.confirm(identity.astronautId, IdSchema.parse((await context.params).id),
      ConfirmCheckInWithVisionRequestSchema.parse(await readJson(request)));
    void artifacts.generate(identity, result.checkIn.id).catch(() => {});
    const body = Reply.parse({ data: result, meta: { contractVersion: "2.0.0", requestId: randomUUID() } });
    return Response.json(body, { status: 202, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Request-ID": body.meta.requestId } });
  });
}
