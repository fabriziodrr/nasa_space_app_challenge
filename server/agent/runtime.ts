import { loadAgentConfig } from "./config";
import { AgentError } from "./core/errors";
import { createConversationService } from "./core/conversation-service";
import { MemoryConversationRepository } from "./adapters/memory-conversation-repository";
import { createConversationAiProvider } from "./adapters/conversation-ai-factory";
import { DemoIdentityProvider } from "./adapters/demo-identity";
import { createDemoContextProviders } from "./adapters/demo-context";

function createDemoRuntime() {
  const config = loadAgentConfig(process.env);
  if (config.AGENT_DEMO_ENABLED !== "true") {
    throw new AgentError("PROVIDER_UNAVAILABLE", "Modulo agent non configurato. Collegare gli adattatori o abilitare la demo locale.");
  }
  const repository = new MemoryConversationRepository();
  const context = createDemoContextProviders(config.AGENT_DEMO_SCENARIO);
  const ai = createConversationAiProvider(config);
  return {
    identity: new DemoIdentityProvider(config.AGENT_DEMO_TOKEN!),
    service: createConversationService({
      ai, repository, ...context, timeoutMs: config.AGENT_AI_TIMEOUT_MS,
      contextMessageLimit: config.AGENT_CONTEXT_MESSAGE_LIMIT,
      previousCheckInLimit: config.AGENT_PREVIOUS_CHECK_IN_LIMIT,
    }),
  };
}

export type AgentRuntime = ReturnType<typeof createDemoRuntime>;
const globalRuntime = globalThis as typeof globalThis & { __issAgentRuntime?: AgentRuntime };

// Process-scoped across dev hot reloads. N1 replaces this composition root for durability.
export function getAgentRuntime(): AgentRuntime {
  loadAgentConfig(process.env);
  return globalRuntime.__issAgentRuntime ??= createDemoRuntime();
}
