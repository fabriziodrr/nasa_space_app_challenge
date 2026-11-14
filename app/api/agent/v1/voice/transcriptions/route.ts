import { createVoiceHttpHandlers } from "@/server/agent/http/voice-handlers";
import { getAgentRuntime } from "@/server/agent/runtime";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = (request: Request) => createVoiceHttpHandlers(getAgentRuntime).transcribe(request);
