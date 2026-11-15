import { NextResponse } from "next/server";
import { demoCrewMappings } from "@/server/agent/demo-crew";
import { demoCrewCredentials } from "@/server/agent/adapters/demo-credentials";

// This is a local demonstration identity selector, not an authentication system.
export async function POST(request: Request) {
  const url = new URL(request.url);
  // Next's development server may construct request.url with localhost even
  // when the browser connected to 127.0.0.1. Check the actual Host header.
  const host = request.headers.get("host");
  if (host) url.host = host;
  if (process.env.NODE_ENV === "production" || process.env.AGENT_DEMO_ENABLED !== "true" ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || request.headers.get("origin") !== url.origin) {
    return NextResponse.json({ error: "Local demo unavailable." }, { status: 403 });
  }
  let profile: unknown;
  try { profile = (await request.json()).profile; } catch { return NextResponse.json({ error: "Invalid profile." }, { status: 400 }); }
  const member = demoCrewMappings.find((item) => item.astronautId === profile);
  const key = profile === "ground" ? "AGENT_GROUND_TOKEN" : member?.tokenEnv;
  const token = key ? process.env[key] || demoCrewCredentials()[key] : undefined;
  if (!token || token.length < 16 || token.length > 512) {
    return NextResponse.json({ error: "Demo profile is not configured on the server." }, { status: 503 });
  }
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set("aegis_demo", token, { httpOnly: true, sameSite: "strict", secure: url.protocol === "https:", path: "/" });
  return response;
}
