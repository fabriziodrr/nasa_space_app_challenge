import type { AgentConfig } from "../config";
import type { ConversationAiProvider } from "../ports";
import { MockConversationAiProvider } from "./mock-conversation-ai";
import { NvidiaConversationProvider } from "./nvidia-conversation-ai";
import { OpenAiConversationProvider } from "./openai-conversation-ai";

export function createConversationAiProvider(config: AgentConfig): ConversationAiProvider {
  switch (config.AGENT_AI_PROVIDER) {
    case "nvidia":
      return new NvidiaConversationProvider({
        apiKey: config.NVIDIA_API_KEY!, model: config.NVIDIA_MODEL,
        timeoutMs: config.AGENT_AI_TIMEOUT_MS,
      });
    case "openai":
      return new OpenAiConversationProvider({
        apiKey: config.OPENAI_API_KEY!, model: config.OPENAI_MODEL!,
        timeoutMs: config.AGENT_AI_TIMEOUT_MS,
      });
    case "mock":
      return new MockConversationAiProvider();
  }
}
