import { createArtifactHttpHandlers } from "@/server/agent/http/artifact-handlers";
import { getAgentRuntime } from "@/server/agent/runtime";
export const runtime = "nodejs";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return createArtifactHttpHandlers(getAgentRuntime).updateDiary(request, (await context.params).id);
}
