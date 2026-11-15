export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Demo-only proxy to the local data service. Authorization is checked by Python.
export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization || !authorization.startsWith("Bearer ") || authorization.length > 1024) {
    return Response.json({ error: "Credenziali demo richieste." }, { status: 401 });
  }
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || !("vision_session_id" in body) ||
        typeof body.vision_session_id !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(body.vision_session_id) ||
        Object.keys(body).length !== 1) {
      return Response.json({ error: "Sessione non valida." }, { status: 400 });
    }
    const result = await fetch("http://127.0.0.1:8000/v1/demo/integrated-context", {
      method: "POST", headers: { "Content-Type": "application/json", authorization },
      body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(8000),
    });
    return Response.json(await result.json(), { status: result.status, headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Backend dati non disponibile." }, { status: 503 });
  }
}
