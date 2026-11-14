import { createVisionHttpHandlers } from "@/server/agent/http/vision-handlers";
import { getAgentRuntime } from "@/server/agent/runtime";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: RouteContext) { return createVisionHttpHandlers(getAgentRuntime).import(request, (await context.params).id); }
export async function GET(request: Request, context: RouteContext) { return createVisionHttpHandlers(getAgentRuntime).list(request, (await context.params).id); }
