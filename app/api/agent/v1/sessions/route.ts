import { createConversationHttpHandlers } from "@/server/agent/http/conversation-handlers";
import { getAgentRuntime } from "@/server/agent/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handlers = createConversationHttpHandlers(getAgentRuntime);
export const POST = handlers.createSession;
