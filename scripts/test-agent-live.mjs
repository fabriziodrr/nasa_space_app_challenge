import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: {
  "base-url": { type: "string", default: "http://127.0.0.1:3000" },
  help: { type: "boolean", default: false },
} });

async function main() {
  if (values.help) {
    console.log("Start npm run dev first, then npm run test:agent:live -- --base-url http://127.0.0.1:3000");
    return;
  }
  if (existsSync(".env")) process.loadEnvFile(".env");
  if (process.env.AGENT_AI_PROVIDER !== "nvidia" || !process.env.AGENT_DEMO_TOKEN || !process.env.NVIDIA_API_KEY?.trim()) {
    throw new Error("Configure .env with AGENT_AI_PROVIDER=nvidia, AGENT_DEMO_TOKEN and NVIDIA_API_KEY.");
  }
  const url = new URL(values["base-url"]);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      || !["http:", "https:"].includes(url.protocol) || url.username || url.password
      || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Use a local URL, for example http://127.0.0.1:3000.");
  }
  const base = `${url.origin}/api/agent/v1`;
  const headers = { Authorization: `Bearer ${process.env.AGENT_DEMO_TOKEN}`, "Content-Type": "application/json" };
  async function call(path, method, body, expected = 200, authenticated = true) {
    const response = await fetch(`${base}${path}`, {
      method, headers: authenticated ? headers : {},
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(135_000),
    });
    const payload = await response.json();
    if (response.status !== expected) {
      // Our API returns sanitized errors. Do not print headers/env/upstream bodies.
      throw new Error(`${method} ${path}: HTTP ${response.status}, ${payload.error?.code ?? "UNKNOWN"}. ${payload.error?.message ?? "Unexpected response."}`);
    }
    return payload.data;
  }
  const session = await call("/sessions", "POST", { astronautId: "astro-1" }, 201);
  console.log("OK: session created.");
  const firstRequest = {
    clientMessageId: randomUUID(), inputMode: "TEXT",
    text: "I slept 5 hours. I rate my sleep quality 2 out of 5 and fatigue 4 out of 5.",
  };
  const first = await call(`/sessions/${session.id}/messages`, "POST", firstRequest);
  assert.ok(!first.assistantMessage.text.startsWith("I've collected the draft"), "The server is using the mock: restart it with AGENT_AI_PROVIDER=nvidia.");
  for (const [field, value] of [["SLEEP_HOURS", 5], ["SLEEP_QUALITY", 2], ["FATIGUE", 4]]) {
    assert.equal(first.checkIn.observations.find((o) => o.field === field)?.value, value, `Dato estratto non corretto: ${field}`);
  }
  console.log(`Agent: ${first.assistantMessage.text}`);
  const second = await call(`/sessions/${session.id}/messages`, "POST", {
    clientMessageId: randomUUID(), inputMode: "TEXT", text: "Physically I have a slight discomfort in my right shoulder.",
  });
  assert.ok(second.checkIn.observations.some((o) => o.field === "PHYSICAL_NOTES"));
  assert.notEqual(second.assistantMessage.text, first.assistantMessage.text, "The agent repeated the previous reply without responding to the new information.");
  assert.equal(second.checkIn.revision, first.checkIn.revision + 1);
  for (const old of first.checkIn.observations) {
    const current = second.checkIn.observations.find((o) => o.field === old.field);
    assert.equal(current?.value, old.value, `Previous data lost: ${old.field}`);
    assert.equal(current?.id, old.id, `Observation ID changed: ${old.field}`);
  }
  console.log(`Agent: ${second.assistantMessage.text}`);
  const replay = await call(`/sessions/${session.id}/messages`, "POST", firstRequest);
  assert.equal(replay.astronautMessage.id, first.astronautMessage.id);
  const state = await call(`/sessions/${session.id}`, "GET");
  assert.equal(state.messages.length, 4);
  assert.equal(state.checkIn.revision, second.checkIn.revision);
  assert.deepEqual(state.checkIn.sharedObservationIds, []);
  assert.equal(state.proposal, null);
  await call(`/sessions/${session.id}`, "GET", undefined, 401, false);
  await call(`/sessions/${session.id}/messages`, "POST", { ...firstRequest, text: "Testo diverso." }, 409);
  console.log("OK: 2 real turns, 4 observations, conversation memory, retry without duplicates, protected access and 409 conflict.");
  console.log(`Session: ${session.id}. The test uses only fake data and does not modify the schedule.`);
}

main().catch((error) => {
  // Avoid printing stack/cause objects that might contain transport details.
  console.error(`Test failed: ${error instanceof Error ? error.message : "unexpected error"}`);
  console.error("Check that the server is running, the URL/port are correct and the configuration has been reloaded.");
  process.exitCode = 1;
});
