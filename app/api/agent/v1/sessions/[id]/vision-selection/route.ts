import { createVisionHttpHandlers } from "@/server/agent/http/vision-handlers";
import { getAgentRuntime } from "@/server/agent/runtime";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  return createVisionHttpHandlers(getAgentRuntime).select(request, (await context.params).id);
}
