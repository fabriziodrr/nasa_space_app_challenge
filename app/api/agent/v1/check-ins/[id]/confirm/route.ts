import { createArtifactHttpHandlers } from "@/server/agent/http/artifact-handlers";
import { getAgentRuntime } from "@/server/agent/runtime";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return createArtifactHttpHandlers(getAgentRuntime).confirm(request, (await context.params).id);
}
