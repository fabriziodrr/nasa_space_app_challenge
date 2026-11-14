import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import {
  type AstronautIdentity, type ConversationOutput, type Identity, type Scenario,
} from "../../server/agent/contracts";
import type { ConversationAiProvider, ConversationContext, ConversationRepository, VisionObservationReader } from "../../server/agent/ports";
import { createConversationService } from "../../server/agent/core/conversation-service";
import { AgentError } from "../../server/agent/core/errors";
import { MemoryConversationRepository } from "../../server/agent/adapters/memory-conversation-repository";
import { MockConversationAiProvider } from "../../server/agent/adapters/mock-conversation-ai";
import { createDemoContextProviders } from "../../server/agent/adapters/demo-context";
import { createConversationHttpHandlers } from "../../server/agent/http/conversation-handlers";
import { DemoIdentityProvider } from "../../server/agent/adapters/demo-identity";
import { loadAgentConfig } from "../../server/agent/config";
import { MockVisionReader } from "../../server/agent/adapters/mock-vision-reader";

const actor: AstronautIdentity = { userId: "user-1", role: "ASTRONAUT", astronautId: "astro-1" };
const other: AstronautIdentity = { userId: "user-2", role: "ASTRONAUT", astronautId: "astro-2" };
const ground: Identity = { userId: "ground-1", role: "GROUND_CONTROL", astronautIds: ["astro-1"] };
const fixedTime = new Date("2026-11-14T06:00:00Z");
const complete = "Ho dormito 5 ore. Qualita del sonno 2 su 5. Stanchezza 4 su 5.";
const code = (expected: string) => (error: unknown) => error instanceof AgentError && error.code === expected;

function harness(options: {
  ai?: ConversationAiProvider; repository?: ConversationRepository; scenario?: Scenario;
  timeoutMs?: number; contextMessageLimit?: number; vision?: VisionObservationReader;
} = {}) {
  let nextId = 0;
  const repository = options.repository ?? new MemoryConversationRepository();
  const service = createConversationService({
    repository, ai: options.ai ?? new MockConversationAiProvider(),
    ...createDemoContextProviders(options.scenario ?? "RESTED"),
    now: () => fixedTime, newId: () => `test-${++nextId}`,
    timeoutMs: options.timeoutMs, contextMessageLimit: options.contextMessageLimit,
    vision: options.vision,
  });
  return { repository, service };
}
const message = (id: string, text: string) => ({ clientMessageId: id, text, inputMode: "TEXT" });

test("selected synthetic vision reaches the model without becoming a self report", async () => {
  let captured: ConversationContext | undefined;
  const mock = new MockConversationAiProvider();
  const { service } = harness({ vision: new MockVisionReader("POOR_SLEEP", () => fixedTime),
    ai: { async converse(context) { captured = structuredClone(context); return mock.converse(context); } } });
  const session = await service.createSession(actor, { astronautId: actor.astronautId });
  const result = await service.sendMessage(actor, session.id, { ...message("v1", "Ho dormito 5 ore."), inputMode: "VOICE" });
  assert.equal(captured?.visionObservations[0].source, "synthetic");
  assert.equal(captured?.visionObservations[0].usability, "INSUFFICIENT");
  assert.match(result.assistantMessage.text, /sintetica/);
  assert.equal(result.astronautMessage.inputMode, "VOICE");
  assert.deepEqual(result.checkIn.observations.map((item) => item.field), ["SLEEP_HOURS"]);
});

test("vision reader rejects another astronaut's observation before AI is called", async () => {
  const mock = new MockVisionReader("RESTED", () => fixedTime);
  let called = false;
  const { service } = harness({ vision: { async getSelectedForSession(_astronautId, id) { return mock.getSelectedForSession("other", id); } },
    ai: { async converse() { called = true; throw new Error("unexpected"); } } });
  const session = await service.createSession(actor, { astronautId: actor.astronautId });
  await assert.rejects(service.sendMessage(actor, session.id, message("v2", "Ciao")), code("INTERNAL_ERROR"));
  assert.equal(called, false);
});

test("stale and low coverage observations are identified without deriving fatigue", async () => {
  const mock = new MockVisionReader("RESTED", () => fixedTime);
  let captured: ConversationContext | undefined;
  const ai = new MockConversationAiProvider();
  const { service } = harness({ vision: { async getSelectedForSession(astronautId, id) {
    const base = await mock.getSelectedForSession(astronautId, id);
    return { ...base, source: "webcam", startedAt: "2026-11-14T02:00:00Z", endedAt: "2026-11-14T02:01:00Z",
      validMs: 20_000, coverage: 0.5, usability: "USABLE", reasons: [] };
  } }, ai: { async converse(context) { captured = structuredClone(context); return ai.converse(context); } } });
  const session = await service.createSession(actor, { astronautId: actor.astronautId });
  const result = await service.sendMessage(actor, session.id, message("v3", "Ciao"));
  assert.deepEqual(new Set(captured?.visionObservations[0].reasons), new Set(["STALE", "LOW_COVERAGE", "TOO_SHORT"]));
  assert.equal(captured?.visionObservations[0].usability, "INSUFFICIENT");
  assert.deepEqual(result.checkIn.observations, []);
  assert.match(result.assistantMessage.text, /non è sufficientemente utilizzabile/);
});

test("usable webcam closure prompts clarification without adding a fatigue score", async () => {
  const mock = new MockVisionReader("POOR_SLEEP", () => fixedTime);
  const { service } = harness({ vision: { async getSelectedForSession(astronautId, id) {
    const base = await mock.getSelectedForSession(astronautId, id);
    return { ...base, source: "webcam", startedAt: "2026-11-14T05:58:00Z", endedAt: "2026-11-14T05:59:00Z", usability: "USABLE", reasons: [] };
  } } });
  const session = await service.createSession(actor, { astronautId: actor.astronautId });
  const result = await service.sendMessage(actor, session.id, message("vision-usable", "Mi sento riposato."));
  assert.match(result.assistantMessage.text, /chiusure prolungate/);
  assert.deepEqual(result.checkIn.observations, []);
});

test("textual check-in accumulates explicit answers and preserves stable observation IDs", async () => {
  const { service } = harness();
  const session = await service.createSession(actor, { astronautId: actor.astronautId });
  const first = await service.sendMessage(actor, session.id, message("client-1", "Ho dormito cinque ore e mezza."));
  assert.equal(first.checkIn.observations[0].value, 5.5);
  const hoursId = first.checkIn.observations[0].id;
  assert.match(first.assistantMessage.text, /qualita/i);
  const second = await service.sendMessage(actor, session.id, message("client-2", "Qualita del sonno 2 su 5. Stanchezza 4 su 5."));
  assert.equal(second.checkIn.revision, 2);
  assert.equal(second.checkIn.id, first.checkIn.id);
  assert.equal(second.checkIn.observations.find((o) => o.field === "SLEEP_HOURS")?.id, hoursId);
  const third = await service.sendMessage(actor, session.id, message("client-3", "Fisicamente: mi sento affaticato."));
  assert.equal(third.checkIn.observations.length, 4);
  assert.deepEqual(third.checkIn.sharedObservationIds, []);
  const state = await service.getSession(actor, session.id);
  assert.equal(state.messages.length, 6);
  assert.equal(state.proposal, null);
  assert.equal(state.generationStatus, "NOT_STARTED");
});

test("sleep corrections update the value and provenance without replacing the observation ID", async () => {
  const { service } = harness();
  const session = await service.createSession(actor, { astronautId: "astro-1" });
  const first = await service.sendMessage(actor, session.id, message("first", "Ho dormito 5 ore."));
  const corrected = await service.sendMessage(actor, session.id, message("second", "Ho dormito 6 ore."));
  assert.equal(corrected.checkIn.observations[0].value, 6);
  assert.equal(corrected.checkIn.observations[0].id, first.checkIn.observations[0].id);
  assert.deepEqual(corrected.checkIn.observations[0].messageIds, [corrected.astronautMessage.id]);
});

test("missing or qualitative answers do not become fabricated numeric measurements", async () => {
  const { service } = harness();
  const session = await service.createSession(actor, { astronautId: "astro-1" });
  const result = await service.sendMessage(actor, session.id, message("first", "Ho dormito male e mi sento stanco."));
  assert.deepEqual(result.checkIn.observations, []);
  assert.match(result.assistantMessage.text, /Quante ore/);
});

test("conflicting sensor and self-report values remain separate and trigger clarification", async () => {
  const { service } = harness({ scenario: "CONFLICTING_DATA" });
  const session = await service.createSession(actor, { astronautId: "astro-1" });
  const result = await service.sendMessage(actor, session.id, message("first", "Ho dormito 4 ore."));
  assert.equal(result.checkIn.observations[0].value, 4);
  assert.match(result.assistantMessage.text, /8 ore/);
  assert.match(result.assistantMessage.text, /stesso periodo di riposo/);
});

test("a rested conversation never applies or invents a schedule proposal in T1", async () => {
  const { service } = harness();
  const session = await service.createSession(actor, { astronautId: "astro-1" });
  await service.sendMessage(actor, session.id, message("first", "Ho dormito 8 ore. Qualita del sonno 4 su 5. Stanchezza 1 su 5."));
  const result = await service.sendMessage(actor, session.id, message("second", "Fisicamente: mi sento bene."));
  assert.match(result.assistantMessage.text, /programma resta invariato/i);
  assert.equal((await service.getSession(actor, session.id)).proposal, null);
});

test("same message retry returns the same result without another AI call", async () => {
  let calls = 0;
  const mock = new MockConversationAiProvider();
  const { service } = harness({ ai: { async converse(context) { calls++; return mock.converse(context); } } });
  const session = await service.createSession(actor, { astronautId: "astro-1" });
  const request = message("same-id", complete);
  const first = await service.sendMessage(actor, session.id, request);
  assert.deepEqual(await service.sendMessage(actor, session.id, request), first);
  assert.equal(calls, 1);
  await assert.rejects(service.sendMessage(actor, session.id, { ...request, text: "Different" }), code("IDEMPOTENCY_CONFLICT"));
  assert.equal((await service.getSession(actor, session.id)).messages.length, 2);
});

test("concurrent identical retries share one AI invocation", async () => {
  let calls = 0;
  const mock = new MockConversationAiProvider();
  const { service } = harness({ ai: { async converse(context) { calls++; return mock.converse(context); } } });
  const session = await service.createSession(actor, { astronautId: "astro-1" });
  const request = message("same-id", complete);
  const [first, second] = await Promise.all([
    service.sendMessage(actor, session.id, request), service.sendMessage(actor, session.id, request),
  ]);
  assert.deepEqual(first, second);
  assert.equal(calls, 1);
});

test("concurrent different messages cannot silently overwrite the same draft revision", async () => {
  let release: () => void = () => {};
  const ready = new Promise<void>((resolve) => { release = resolve; });
  let started = 0;
  const mock = new MockConversationAiProvider();
  const { service } = harness({ ai: { async converse(context) {
    if (++started === 2) release();
    await ready;
    return mock.converse(context);
  } } });
  const session = await service.createSession(actor, { astronautId: "astro-1" });
  const results = await Promise.allSettled([
    service.sendMessage(actor, session.id, message("a", "Ho dormito 5 ore.")),
    service.sendMessage(actor, session.id, message("b", "Ho dormito 6 ore.")),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const failure = results.find((r) => r.status === "rejected");
  assert.ok(failure?.status === "rejected" && code("VERSION_CONFLICT")(failure.reason));
  assert.equal((await service.getSession(actor, session.id)).messages.length, 2);
});

test("invalid AI schema leaves the conversation and draft unchanged", async () => {
  const { service } = harness({ ai: { async converse() { return { reply: "bad", observations: "bad" } as unknown as ConversationOutput; } } });
  const session = await service.createSession(actor, { astronautId: "astro-1" });
  await assert.rejects(service.sendMessage(actor, session.id, message("bad", complete)), code("INVALID_AI_OUTPUT"));
  const state = await service.getSession(actor, session.id);
  assert.equal(state.messages.length, 0);
  assert.equal(state.checkIn, null);
});

test("fabricated or assistant evidence references cannot become self-reports", async () => {
  const mock = new MockConversationAiProvider();
  const { service } = harness({ ai: { async converse(context) {
    const output = await mock.converse(context);
    for (const observation of output.observations) observation.messageIds = ["invented-message"];
    return output;
  } } });
  const session = await service.createSession(actor, { astronautId: "astro-1" });
  await assert.rejects(service.sendMessage(actor, session.id, message("bad-ref", complete)), code("INVALID_AI_OUTPUT"));
  assert.equal((await service.getSession(actor, session.id)).messages.length, 0);
});

test("dropping existing observations in an AI response is rejected atomically", async () => {
  const mock = new MockConversationAiProvider();
  let calls = 0;
  const { service } = harness({ ai: { async converse(context) {
    if (++calls === 1) return mock.converse(context);
    return { reply: "Wrong", observations: [], missingFields: ["SLEEP_HOURS", "SLEEP_QUALITY", "FATIGUE", "PHYSICAL_NOTES"] };
  } } });
  const session = await service.createSession(actor, { astronautId: "astro-1" });
  const first = await service.sendMessage(actor, session.id, message("first", "Ho dormito 5 ore."));
  await assert.rejects(service.sendMessage(actor, session.id, message("second", "Ciao")), code("INVALID_AI_OUTPUT"));
  assert.deepEqual((await service.getSession(actor, session.id)).checkIn, first.checkIn);
});

test("timeouts abort the provider and never save a late response", async () => {
  let providerSignal: AbortSignal | undefined;
  let finish: (output: ConversationOutput) => void = () => {};
  const pending = new Promise<ConversationOutput>((resolve) => { finish = resolve; });
  const { service } = harness({ timeoutMs: 20, ai: { async converse(_context, options) {
    providerSignal = options?.signal; return pending;
  } } });
  const session = await service.createSession(actor, { astronautId: "astro-1" });
  await assert.rejects(service.sendMessage(actor, session.id, message("slow", complete)), code("PROVIDER_TIMEOUT"));
  assert.equal(providerSignal?.aborted, true);
  finish({ reply: "Late", observations: [], missingFields: ["SLEEP_HOURS", "SLEEP_QUALITY", "FATIGUE", "PHYSICAL_NOTES"] });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await service.getSession(actor, session.id)).messages.length, 0);
});

test("provider failures can be retried with the same client message ID", async () => {
  let calls = 0;
  const mock = new MockConversationAiProvider();
  const { service } = harness({ ai: { async converse(context) {
    if (++calls === 1) throw new Error("private upstream detail");
    return mock.converse(context);
  } } });
  const session = await service.createSession(actor, { astronautId: "astro-1" });
  const request = message("retry", complete);
  await assert.rejects(service.sendMessage(actor, session.id, request), code("PROVIDER_UNAVAILABLE"));
  assert.equal((await service.sendMessage(actor, session.id, request)).checkIn.revision, 1);
});

test("context stays bounded while unchanged draft provenance remains valid", async () => {
  const contexts: ConversationContext[] = [];
  const mock = new MockConversationAiProvider();
  const { service } = harness({ contextMessageLimit: 2, ai: { async converse(context) {
    contexts.push(structuredClone(context)); return mock.converse(context);
  } } });
  const session = await service.createSession(actor, { astronautId: "astro-1" });
  await service.sendMessage(actor, session.id, message("first", "Ho dormito 8 ore."));
  await service.sendMessage(actor, session.id, message("second", "Ciao"));
  const third = await service.sendMessage(actor, session.id, message("third", "Vorrei parlare."));
  assert.equal(third.checkIn.observations[0].value, 8);
  assert.ok(contexts.every((context) => context.messages.length <= 2 && JSON.stringify(context).length <= 64_000));
});

test("no identity, ground role and another astronaut cannot access a private session", async () => {
  const { service } = harness();
  const session = await service.createSession(actor, { astronautId: "astro-1" });
  await assert.rejects(service.getSession(null, session.id), code("UNAUTHENTICATED"));
  await assert.rejects(service.getSession(ground, session.id), code("FORBIDDEN"));
  await assert.rejects(service.getSession(other, session.id), code("NOT_FOUND"));
  await assert.rejects(service.sendMessage(other, session.id, message("bad", complete)), code("NOT_FOUND"));
  await assert.rejects(service.createSession(actor, { astronautId: "astro-2" }), code("NOT_FOUND"));
});

test("an inconsistent repository result cannot expose another astronaut's turn", async () => {
  class InconsistentRepository extends MemoryConversationRepository {
    override async commitTurn(input: Parameters<ConversationRepository["commitTurn"]>[0]) {
      const result = await super.commitTurn(input);
      result.checkIn.astronautId = "astro-2";
      return result;
    }
  }
  const { service } = harness({ repository: new InconsistentRepository() });
  const session = await service.createSession(actor, { astronautId: "astro-1" });
  await assert.rejects(service.sendMessage(actor, session.id, message("first", complete)), code("INTERNAL_ERROR"));
});

test("confirmed check-ins reject new turns before calling AI", async () => {
  const base = new MemoryConversationRepository();
  const repository: ConversationRepository = {
    createSession: base.createSession.bind(base), getTurn: base.getTurn.bind(base),
    commitTurn: base.commitTurn.bind(base), listPreviousCheckIns: base.listPreviousCheckIns.bind(base),
    async getSessionState(...args) {
      const state = await base.getSessionState(...args);
      if (state?.checkIn) { state.checkIn.status = "CONFIRMED"; state.checkIn.confirmedAt = fixedTime.toISOString(); }
      return state;
    },
  };
  const { service } = harness({ repository });
  const session = await service.createSession(actor, { astronautId: "astro-1" });
  await service.sendMessage(actor, session.id, message("first", "Ho dormito 8 ore."));
  await assert.rejects(service.sendMessage(actor, session.id, message("second", "Ciao")), code("INVALID_STATE"));
});

function httpHarness(identity: Identity | null = actor) {
  const h = harness();
  return { ...h, handlers: createConversationHttpHandlers(() => ({
    service: h.service, identity: { async authenticate() { return identity; } },
  })) };
}
function request(path: string, body?: unknown) {
  return new Request(`http://localhost/api/agent/v1${path}`, body === undefined ? undefined : {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

test("HTTP create/send/get uses the C0 envelope and never caches private responses", async () => {
  const { handlers } = httpHarness();
  const created = await handlers.createSession(request("/sessions", { astronautId: "astro-1" }));
  assert.equal(created.status, 201);
  const session = (await created.json()).data;
  const sent = await handlers.sendMessage(request(`/sessions/${session.id}/messages`, message("first", complete)), session.id);
  assert.equal(sent.status, 200);
  assert.equal(sent.headers.get("cache-control"), "no-store");
  const body = await sent.json();
  assert.equal(body.meta.contractVersion, "1.0.0");
  assert.equal(body.data.checkIn.status, "DRAFT");
  const state = await handlers.getSession(request(`/sessions/${session.id}`), session.id);
  assert.equal(state.status, 200);
  assert.equal((await state.json()).data.messages.length, 2);
});

test("HTTP rejects invalid JSON, unknown request fields and oversized bodies", async () => {
  const { handlers } = httpHarness();
  const malformed = new Request("http://localhost/api/agent/v1/sessions", {
    method: "POST", headers: { "content-type": "application/json" }, body: "{",
  });
  assert.equal((await handlers.createSession(malformed)).status, 400);
  assert.equal((await handlers.createSession(request("/sessions", { astronautId: "astro-1", role: "GROUND_CONTROL" }))).status, 400);
  const huge = request("/sessions", { astronautId: "astro-1", text: "x".repeat(70_000) });
  assert.equal((await handlers.createSession(huge)).status, 413);
});

test("HTTP returns correct authorization status and hides arbitrary internal errors", async () => {
  assert.equal((await httpHarness(null).handlers.createSession(request("/sessions", { astronautId: "astro-1" }))).status, 401);
  assert.equal((await httpHarness(ground).handlers.createSession(request("/sessions", { astronautId: "astro-1" }))).status, 403);
  const broken = createConversationHttpHandlers(() => { throw new Error("secret-key-and-private-data"); });
  const response = await broken.createSession(request("/sessions", { astronautId: "astro-1" }));
  assert.equal(response.status, 500);
  assert.ok(!(await response.text()).includes("secret-key-and-private-data"));
});

test("HTTP preserves branded domain errors from another route module or JavaScript realm", async () => {
  const foreignError = runInNewContext(`new class extends Error {
    constructor() {
      super('Messaggio duplicato');
      this[Symbol.for('iss.agent.AgentError')] = true;
      this.code = 'IDEMPOTENCY_CONFLICT';
      this.retryable = false;
    }
  }`);
  const handlers = createConversationHttpHandlers(() => { throw foreignError; });
  const response = await handlers.createSession(request("/sessions", { astronautId: "astro-1" }));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, "IDEMPOTENCY_CONFLICT");
});

test("HTTP session pagination validates cursor query and rejects duplicates", async () => {
  const { handlers, service } = httpHarness();
  const session = await service.createSession(actor, { astronautId: "astro-1" });
  const response = await handlers.getSession(request(`/sessions/${session.id}?beforeMessageId=a&beforeMessageId=b`), session.id);
  assert.equal(response.status, 400);
  const unknown = await handlers.getSession(request(`/sessions/${session.id}?role=GROUND_CONTROL`), session.id);
  assert.equal(unknown.status, 400);
});

test("demo credentials are server-defined and cannot be replaced by cookie roles", async () => {
  const identity = new DemoIdentityProvider("private-token-at-least-16");
  assert.equal(await identity.authenticate({ authorizationHeader: null, sessionCookie: "role=ASTRONAUT" }), null);
  assert.equal(await identity.authenticate({ authorizationHeader: "Bearer wrong", sessionCookie: null }), null);
  assert.equal((await identity.authenticate({ authorizationHeader: "Bearer private-token-at-least-16", sessionCookie: null }))?.astronautId, "astro-1");
});

test("configuration fails closed in production and real mode requires explicit credentials/model", () => {
  assert.equal(loadAgentConfig({}).AGENT_DEMO_ENABLED, "false");
  assert.throws(() => loadAgentConfig({ NODE_ENV: "production", AGENT_DEMO_ENABLED: "true", AGENT_DEMO_TOKEN: "private-token-at-least-16" }));
  assert.throws(() => loadAgentConfig({ AGENT_DEMO_ENABLED: "true" }));
  assert.throws(() => loadAgentConfig({ AGENT_AI_PROVIDER: "openai" }));
  assert.equal(loadAgentConfig({ AGENT_AI_PROVIDER: "openai", OPENAI_API_KEY: "test-key", OPENAI_MODEL: "configured-model" }).AGENT_AI_PROVIDER, "openai");
});
