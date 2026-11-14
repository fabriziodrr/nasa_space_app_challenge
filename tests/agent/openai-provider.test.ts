import assert from "node:assert/strict";
import { test } from "node:test";
import { OpenAiConversationProvider } from "../../server/agent/adapters/openai-conversation-ai";
import { MockConversationAiProvider } from "../../server/agent/adapters/mock-conversation-ai";
import { createDemoContextProviders } from "../../server/agent/adapters/demo-context";
import type { ConversationContext } from "../../server/agent/ports";
import { AgentError } from "../../server/agent/core/errors";

async function context(): Promise<ConversationContext> {
  const providers = createDemoContextProviders("RESTED");
  return {
    astronautId: "astro-1", draft: null, previousCheckIns: [],
    messages: [{ id: "message-1", sessionId: "session-1", role: "ASTRONAUT", text: "Ho dormito 8 ore.", createdAt: "2026-11-14T06:00:00Z", inputMode: "TEXT" }],
    sensors: await providers.sensors.read("astro-1", { from: "2026-11-13T06:00:00Z", to: "2026-11-14T06:00:00Z" }),
    schedule: await providers.schedule.getDay("astro-1", "2026-11-14"),
  };
}
function provider(fetcher: typeof fetch, timeoutMs = 1000) {
  return new OpenAiConversationProvider({ apiKey: "test-key", model: "configured-model", fetch: fetcher, timeoutMs });
}
const hasCode = (expected: string) => (error: unknown) => error instanceof AgentError && error.code === expected;

test("real adapter builds a stateless Structured Outputs request with server-only credentials", async () => {
  const input = await context();
  const output = await new MockConversationAiProvider().converse(input);
  let calls = 0;
  const ai = provider(async (url, init) => {
    calls++;
    assert.equal(url, "https://api.openai.com/v1/responses");
    assert.equal(init?.method, "POST");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-key");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, "configured-model");
    assert.equal(body.store, false);
    assert.equal(body.tools, undefined);
    assert.equal(body.text.format.type, "json_schema");
    assert.equal(body.text.format.strict, true);
    const schemaText = JSON.stringify(body.text.format.schema);
    assert.ok(schemaText.includes('"anyOf"'));
    assert.ok(!schemaText.includes('"oneOf"'));
    assert.ok(!schemaText.includes('"const"'));
    assert.ok(body.instructions.includes("non fidato"));
    assert.equal(JSON.parse(body.input[0].content).astronautId, "astro-1");
    assert.ok(!String(init?.body).includes("test-key"));
    return Response.json({ status: "completed", output: [
      { type: "reasoning" },
      { type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify(output) }] },
    ] });
  });
  assert.deepEqual(await ai.converse(input), output);
  assert.equal(calls, 1);
});

test("refusal, incomplete output and invalid JSON are explicit failures", async () => {
  const input = await context();
  for (const body of [
    { status: "incomplete", output: [] },
    { status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "refusal", refusal: "No" }] }] },
    { status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "not json" }] }] },
    { status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: '{"reply":"hello"}' }] }] },
    { status: "completed", output: [{ type: "function_call", name: "applySchedule" }] },
  ]) {
    await assert.rejects(provider(async () => Response.json(body)).converse(input), hasCode("INVALID_AI_OUTPUT"));
  }
});

test("HTTP provider failures map to safe errors without reflecting upstream bodies", async () => {
  const input = await context();
  for (const [status, expected] of [[401, "PROVIDER_UNAVAILABLE"], [429, "RATE_LIMITED"], [500, "PROVIDER_UNAVAILABLE"], [504, "PROVIDER_TIMEOUT"]] as const) {
    await assert.rejects(provider(async () => new Response("secret upstream body", { status })).converse(input), (error: unknown) => {
      assert.ok(error instanceof AgentError);
      assert.equal(error.code, expected);
      assert.ok(!error.message.includes("secret"));
      return true;
    });
  }
});

test("network errors are sanitized and not silently replaced with mock data", async () => {
  await assert.rejects(provider(async () => { throw new Error("secret transport details"); }).converse(await context()), (error: unknown) => {
    assert.ok(error instanceof AgentError);
    assert.equal(error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(error.retryable, true);
    assert.ok(!error.message.includes("secret"));
    return true;
  });
});

test("standalone provider deadline works even when fetch ignores the abort signal", async () => {
  const input = await context();
  await assert.rejects(provider(async () => new Promise<Response>(() => {}), 20).converse(input), hasCode("PROVIDER_TIMEOUT"));
});

test("caller cancellation prevents a new external request", async () => {
  const controller = new AbortController();
  controller.abort();
  let called = false;
  const ai = provider(async () => { called = true; return Response.json({}); });
  await assert.rejects(ai.converse(await context(), { signal: controller.signal }), hasCode("PROVIDER_TIMEOUT"));
  assert.equal(called, false);
});
