import { createProposalHttpHandlers } from "@/server/agent/http/proposal-handlers";
import { getAgentRuntime } from "@/server/agent/runtime";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => createProposalHttpHandlers(getAgentRuntime).schedule(request);
