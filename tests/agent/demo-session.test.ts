import test from "node:test";
import assert from "node:assert/strict";
import { DemoIdentityProvider } from "../../server/agent/adapters/demo-identity";
import { POST } from "../../app/api/demo-session/route";
import { demoCrewCredentials } from "../../server/agent/adapters/demo-credentials";
import { createHmac } from "node:crypto";

test("local demo session issues an HttpOnly cookie and resolves its server-defined identity", async () => {
  const oldDemo = process.env.AGENT_DEMO_ENABLED;
  const oldToken = process.env.AGENT_DEMO_TOKEN;
  const environment: Record<string, string | undefined> = process.env;
  const oldNode = environment.NODE_ENV;
  process.env.AGENT_DEMO_ENABLED = "true";
  process.env.AGENT_DEMO_TOKEN = "local-demo-token-123456";
  environment.NODE_ENV = "test";
  try {
    const request = (origin: string) => new Request("http://localhost:3000/api/demo-session", {
      method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ profile: "astro-1" }),
    });
    assert.equal((await POST(request("https://external.example"))).status, 403);
    const loopbackRequest = new Request("http://localhost:3000/api/demo-session", {
      method: "POST", headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000", "content-type": "application/json" },
      body: JSON.stringify({ profile: "astro-1" }),
    });
    assert.equal((await POST(loopbackRequest)).status, 200);
    const response = await POST(request("http://localhost:3000"));
    assert.equal(response.status, 200);
    const cookie = response.headers.get("set-cookie")!;
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=strict/i);
    const identity = await new DemoIdentityProvider(process.env.AGENT_DEMO_TOKEN).authenticate({ authorizationHeader: null, sessionCookie: cookie });
    assert.equal(identity?.role, "ASTRONAUT");
    assert.equal(await new DemoIdentityProvider(process.env.AGENT_DEMO_TOKEN).authenticate({ authorizationHeader: null, sessionCookie: "aegis_demo=forged" }), null);
    environment.NODE_ENV = "production";
    assert.equal((await POST(request("http://localhost:3000"))).status, 403);
  } finally {
    if (oldDemo === undefined) delete process.env.AGENT_DEMO_ENABLED; else process.env.AGENT_DEMO_ENABLED = oldDemo;
    if (oldToken === undefined) delete process.env.AGENT_DEMO_TOKEN; else process.env.AGENT_DEMO_TOKEN = oldToken;
    if (oldNode === undefined) delete environment.NODE_ENV; else environment.NODE_ENV = oldNode;
  }
});

test("fictional crew profiles have stable distinct server credentials without manual setup", async () => {
  const tokens = demoCrewCredentials({});
  assert.equal(Object.values(tokens).length, 4);
  assert.equal(new Set(Object.values(tokens)).size, 4);
  assert.deepEqual(demoCrewCredentials({}), tokens);
  const provider = new DemoIdentityProvider("local-demo-token-123456", undefined, tokens);
  const identity = await provider.authenticate({ authorizationHeader: `Bearer ${tokens.AGENT_CREW_02_TOKEN}`, sessionCookie: null });
  assert.equal(identity?.role, "ASTRONAUT");
  if (identity?.role === "ASTRONAUT") assert.equal(identity.astronautId, "crew-demo-02");
});

test("automatic crew credentials can be resolved by the Python backend from the shared demo secret", () => {
  const environment = { AGENT_DEMO_TOKEN: "local-demo-token-123456" };
  const credentials = demoCrewCredentials(environment);
  assert.equal(credentials.AGENT_CREW_02_TOKEN, createHmac("sha256", environment.AGENT_DEMO_TOKEN).update("aegis-demo-crew:crew-demo-02").digest("hex"));
  assert.equal(demoCrewCredentials({ ...environment, AGENT_CREW_02_TOKEN: "explicit-crew-token-123" }).AGENT_CREW_02_TOKEN, "explicit-crew-token-123");
});
