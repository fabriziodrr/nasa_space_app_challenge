import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_NVIDIA_MODEL, NvidiaConversationProvider } from "../../server/agent/adapters/nvidia-conversation-ai";
import { createConversationAiProvider } from "../../server/agent/adapters/conversation-ai-factory";
import { MockConversationAiProvider } from "../../server/agent/adapters/mock-conversation-ai";
import { createDemoContextProviders } from "../../server/agent/adapters/demo-context";
import { MemoryConversationRepository } from "../../server/agent/adapters/memory-conversation-repository";
import { createConversationService } from "../../server/agent/core/conversation-service";
import { AgentError } from "../../server/agent/core/errors";
import { loadAgentConfig } from "../../server/agent/config";
import type { ConversationContext } from "../../server/agent/ports";

async function context(): Promise<ConversationContext> {
  const providers = createDemoContextProviders("RESTED");
  return {
    astronautId: "astro-1", draft: null, previousCheckIns: [],
    messages: [{ id: "message-1", sessionId: "session-1", role: "ASTRONAUT", text: "Ho dormito 8 ore.", createdAt: "2026-11-14T06:00:00Z", inputMode: "TEXT" }],
    sensors: await providers.sensors.read("astro-1", { from: "2026-11-13T06:00:00Z", to: "2026-11-14T06:00:00Z" }),
    schedule: await providers.schedule.getDay("astro-1", "2026-11-14"),
  };
}
function completion(content: unknown, finishReason: unknown = "stop") {
  return { choices: [{ index: 0, finish_reason: finishReason, message: { role: "assistant", content } }] };
}
function provider(fetcher: typeof fetch, timeoutMs = 1000) {
  return new NvidiaConversationProvider({ apiKey: "nvapi-test-key", fetch: fetcher, timeoutMs });
}
const hasCode = (expected: string) => (error: unknown) => error instanceof AgentError && error.code === expected;

test("NVIDIA mode selects real Nemotron with no OpenAI credentials or paid fallback", () => {
  const config = loadAgentConfig({ AGENT_AI_PROVIDER: "nvidia", NVIDIA_API_KEY: "nvapi-test-key" });
  assert.ok(createConversationAiProvider(config) instanceof NvidiaConversationProvider);
  assert.equal(config.OPENAI_API_KEY, undefined);
  assert.equal(config.OPENAI_MODEL, undefined);
  assert.throws(() => loadAgentConfig({ AGENT_AI_PROVIDER: "nvidia" }));
  assert.throws(() => loadAgentConfig({ AGENT_AI_PROVIDER: "nvidia", NVIDIA_API_KEY: " " }));
  assert.throws(() => loadAgentConfig({ AGENT_AI_PROVIDER: "nvidia", NVIDIA_API_KEY: "nvapi-test-key", NVIDIA_MODEL: " " }));
  assert.ok(createConversationAiProvider(loadAgentConfig({})) instanceof MockConversationAiProvider);
});

test("NVIDIA request uses the hosted chat endpoint, current Nemotron defaults and JSON instructions", async () => {
  const input = await context();
  const output = await new MockConversationAiProvider().converse(input);
  let calls = 0;
  const ai = provider(async (url, init) => {
    calls++;
    assert.equal(url, "https://integrate.api.nvidia.com/v1/chat/completions");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer nvapi-test-key");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, DEFAULT_NVIDIA_MODEL);
    assert.equal(body.stream, false);
    assert.equal(body.reasoning_effort, "none");
    assert.equal(body.tools, undefined);
    assert.equal(body.response_format, undefined);
    assert.equal(body.messages[0].role, "system");
    assert.ok(body.messages[0].content.includes("JSON Schema"));
    assert.equal(body.messages[1].role, "user");
    assert.equal(JSON.parse(body.messages[1].content).messages[0].id, "message-1");
    assert.ok(!String(init?.body).includes("nvapi-test-key"));
    return Response.json(completion(JSON.stringify(output)));
  });
  assert.deepEqual(await ai.converse(input), output);
  assert.equal(calls, 1);
});

test("configured NVIDIA model overrides the default without changing the endpoint", async () => {
  const input = await context();
  const output = await new MockConversationAiProvider().converse(input);
  const ai = new NvidiaConversationProvider({ apiKey: "nvapi-test-key", model: "nvidia/configured-nemotron", fetch: async (url, init) => {
    assert.equal(url, "https://integrate.api.nvidia.com/v1/chat/completions");
    assert.equal(JSON.parse(String(init?.body)).model, "nvidia/configured-nemotron");
    return Response.json(completion(JSON.stringify(output)));
  } });
  await ai.converse(input);
});

test("a single full-document JSON fence is tolerated without scraping arbitrary substrings", async () => {
  const input = await context();
  const output = await new MockConversationAiProvider().converse(input);
  const json = JSON.stringify(output);
  assert.deepEqual(await provider(async () => Response.json(completion(`\`\`\`json\n${json}\n\`\`\``))).converse(input), output);
  await assert.rejects(provider(async () => Response.json(completion(`Here is a result: ${json}`))).converse(input), hasCode("INVALID_AI_OUTPUT"));
});

test("truncated output, refusals, tool calls, reasoning text and malformed JSON cannot produce a check-in", async () => {
  const input = await context();
  const validJson = JSON.stringify(await new MockConversationAiProvider().converse(input));
  const refusal = completion(validJson);
  const toolCall = completion(validJson);
  const refusedMessage = { ...refusal.choices[0].message, refusal: "Refused" };
  const toolMessage = { ...toolCall.choices[0].message, tool_calls: [{ type: "function", function: { name: "applySchedule" } }] };
  for (const response of [
    completion(validJson, "length"), completion(validJson, "tool_calls"), completion(null),
    completion("not JSON"), completion('{"reply":"Ciao"}'), completion(`<think>reasoning</think>${validJson}`),
    { choices: [{ ...refusal.choices[0], message: refusedMessage }] },
    { choices: [{ ...toolCall.choices[0], message: toolMessage }] },
    { choices: [completion(validJson).choices[0], completion(validJson).choices[0]] },
  ]) {
    await assert.rejects(provider(async () => Response.json(response)).converse(input), hasCode("INVALID_AI_OUTPUT"));
  }
});

test("NVIDIA errors are sanitized and rate limits do not trigger another provider", async () => {
  const input = await context();
  for (const [status, expected, retryable] of [
    [202, "PROVIDER_UNAVAILABLE", true], [401, "PROVIDER_UNAVAILABLE", false],
    [404, "PROVIDER_UNAVAILABLE", false], [410, "PROVIDER_UNAVAILABLE", false], [422, "PROVIDER_UNAVAILABLE", false],
    [429, "RATE_LIMITED", true], [503, "PROVIDER_UNAVAILABLE", true], [504, "PROVIDER_TIMEOUT", true],
  ] as const) {
    let calls = 0;
    await assert.rejects(provider(async () => { calls++; return new Response("private-upstream-detail", { status }); }).converse(input), (error: unknown) => {
      assert.ok(error instanceof AgentError);
      assert.equal(error.code, expected);
      assert.equal(error.retryable, retryable);
      assert.ok(!error.message.includes("private-upstream-detail"));
      return true;
    });
    assert.equal(calls, 1);
  }
});

test("network errors and non-JSON HTTP bodies are explicit failures", async () => {
  const input = await context();
  await assert.rejects(provider(async () => { throw new Error("private-network-detail"); }).converse(input), hasCode("PROVIDER_UNAVAILABLE"));
  await assert.rejects(provider(async () => new Response("not json")).converse(input), hasCode("INVALID_AI_OUTPUT"));
});

test("NVIDIA requests respect timeout and caller cancellation", async () => {
  const input = await context();
  await assert.rejects(provider(async () => new Promise<Response>(() => {}), 20).converse(input), hasCode("PROVIDER_TIMEOUT"));
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  await assert.rejects(provider(async () => { calls++; return Response.json({}); }).converse(input, { signal: controller.signal }), hasCode("PROVIDER_TIMEOUT"));
  assert.equal(calls, 0);
});

test("NVIDIA output still passes core provenance checks before any turn is saved", async () => {
  const ai = provider(async (_url, init) => {
    const input = JSON.parse(JSON.parse(String(init?.body)).messages[1].content) as ConversationContext;
    const output = await new MockConversationAiProvider().converse(input);
    output.observations[0].messageIds = ["invented-message"];
    return Response.json(completion(JSON.stringify(output)));
  });
  const service = createConversationService({
    ai, repository: new MemoryConversationRepository(), ...createDemoContextProviders("RESTED"),
    now: () => new Date("2026-11-14T06:00:00Z"),
  });
  const actor = { userId: "user-1", role: "ASTRONAUT" as const, astronautId: "astro-1" };
  const session = await service.createSession(actor, { astronautId: "astro-1" });
  await assert.rejects(service.sendMessage(actor, session.id, {
    clientMessageId: "client-1", text: "Ho dormito 8 ore.", inputMode: "TEXT",
  }), hasCode("INVALID_AI_OUTPUT"));
  assert.equal((await service.getSession(actor, session.id)).messages.length, 0);
});
