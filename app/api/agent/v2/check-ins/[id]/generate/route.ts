import { IdSchema } from "@/server/agent/contracts";
import { AgentError } from "@/server/agent/core/errors";
import { createConversationHttpHandlers } from "@/server/agent/http/conversation-handlers";
import { getAgentRuntime } from "@/server/agent/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { handle } = createConversationHttpHandlers(getAgentRuntime);
  return handle(request, async ({ artifacts, repository }, identity) => {
    if (identity.role !== "ASTRONAUT") throw new AgentError("FORBIDDEN", "Funzione riservata all'astronauta.");
    if (!artifacts) throw new AgentError("PROVIDER_UNAVAILABLE", "Generazione report non configurata.");
    const id = IdSchema.parse((await context.params).id);
    const checkIn = await repository.getCheckIn(identity.astronautId, id);
    if (!checkIn) throw new AgentError("NOT_FOUND", "Check-in non trovato.");
    if (checkIn.status !== "CONFIRMED") throw new AgentError("INVALID_STATE", "Conferma prima il check-in.");
    void artifacts.generate(identity, id).catch(() => {});
    return Response.json({ accepted: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
  });
}
