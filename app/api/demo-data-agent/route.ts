export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    return Response.json({ error: "Servizio dati non disponibile." }, { status: 503 });
  }
}
