import { createConversationHttpHandlers } from "@/server/agent/http/conversation-handlers";
import { getAgentRuntime } from "@/server/agent/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handlers = createConversationHttpHandlers(getAgentRuntime);

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handlers.getSession(request, id);
}
