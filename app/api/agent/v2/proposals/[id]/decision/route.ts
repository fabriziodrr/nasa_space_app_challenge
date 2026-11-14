import { createProposalHttpHandlers } from "@/server/agent/http/proposal-handlers";
import { getAgentRuntime } from "@/server/agent/runtime";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return createProposalHttpHandlers(getAgentRuntime).decide(request, (await context.params).id);
}
