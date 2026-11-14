import { createArtifactHttpHandlers } from "@/server/agent/http/artifact-handlers";
import { getAgentRuntime } from "@/server/agent/runtime";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => createArtifactHttpHandlers(getAgentRuntime).diary(request);
