export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getAgentRuntime } from "@/server/agent/runtime";
import { prisma } from "@/server/agent/adapters/prisma/client";

// The report follows the latest selected measurement of the active local profile.
export async function GET(request: Request) {
  try {
    const cookie = request.headers.get("cookie");
    const runtime = getAgentRuntime();
    const identity = await runtime.identity.authenticate({ authorizationHeader: null, sessionCookie: cookie });
    if (!identity || identity.role !== "ASTRONAUT") return Response.json({ error: "Session unavailable." }, { status: 401 });
    const selections = await prisma.visionSelection.findMany({ where: { astronautId: identity.astronautId, observationId: { not: null } } });
    const selected = await prisma.visionObservation.findFirst({
      where: { astronautId: identity.astronautId, id: { in: selections.flatMap((item) => item.observationId ? [item.observationId] : []) } },
      orderBy: [{ importedAt: "desc" }, { id: "desc" }],
    });
    const entry = cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith("aegis_demo="));
    if (!entry) return Response.json({ error: "Session unavailable." }, { status: 401 });
    const authorization = `Bearer ${decodeURIComponent(entry.slice("aegis_demo=".length))}`;
    const backend = process.env.AEGIS_DATA_API_URL ?? "http://127.0.0.1:8000";
    const response = await fetch(`${backend}/v1/demo/data-analysis`, {
      method: "POST", headers: { "Content-Type": "application/json", authorization },
      body: JSON.stringify({ vision_session_id: selected?.sessionId ?? null }), cache: "no-store", signal: AbortSignal.timeout(10000),
    });
    return Response.json(await response.json(), { status: response.status, headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Data service unavailable." }, { status: 503 });
  }
}

// Demo proxy: the Python service enforces the token and fixed synthetic subject.
export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ") || authorization.length > 1024) {
    return Response.json({ error: "Credenziali demo richieste." }, { status: 401 });
  }
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || !("vision_session_id" in body) ||
        typeof body.vision_session_id !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(body.vision_session_id) ||
        Object.keys(body).length !== 1) {
      return Response.json({ error: "Sessione non valida." }, { status: 400 });
    }
    const response = await fetch("http://127.0.0.1:8000/v1/demo/data-analysis", {
      method: "POST", headers: { "Content-Type": "application/json", authorization },
      body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(10000),
    });
    return Response.json(await response.json(), { status: response.status, headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Servizio dati unavailable." }, { status: 503 });
  }
}
