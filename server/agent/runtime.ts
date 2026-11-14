import { loadAgentConfig } from "./config";
import { AgentError } from "./core/errors";
import { createConversationService } from "./core/conversation-service";
import { PrismaAgentRepository } from "./adapters/prisma/repository";
import { prisma } from "./adapters/prisma/client";
import { NvidiaConversationProvider } from "./adapters/nvidia-conversation-ai";
import { MockConversationAiProvider } from "./adapters/mock-conversation-ai";
import { ArtifactService } from "./services/artifacts";
import { CheckInService } from "./services/checkin";
import { ProposalService } from "./services/proposals";
import { ScheduleValidatorImpl } from "./services/validator";
import { createConversationAiProvider } from "./adapters/conversation-ai-factory";
import { DemoIdentityProvider } from "./adapters/demo-identity";
import { createDemoContextProviders } from "./adapters/demo-context";
import { NvidiaNimVoiceProvider } from "./adapters/nvidia-nim-voice";
import { ElevenLabsVoiceProvider } from "./adapters/elevenlabs-voice";

function createDemoRuntime() {
  const config = loadAgentConfig(process.env);
  if (config.AGENT_DEMO_ENABLED !== "true") {
    throw new AgentError("PROVIDER_UNAVAILABLE", "Modulo agent non configurato. Collegare gli adattatori o abilitare la demo locale.");
  }
  const repository = new PrismaAgentRepository(prisma);
  const context = createDemoContextProviders(config.AGENT_DEMO_SCENARIO);
  const ai = createConversationAiProvider(config);
  const artifactAi = config.AGENT_AI_PROVIDER === "nvidia"
    ? new NvidiaConversationProvider({ apiKey: config.NVIDIA_API_KEY!, model: config.NVIDIA_MODEL, timeoutMs: config.AGENT_AI_TIMEOUT_MS })
    : config.AGENT_AI_PROVIDER === "mock" ? new MockConversationAiProvider() : null;
  return {
    identity: new DemoIdentityProvider(config.AGENT_DEMO_TOKEN!, config.AGENT_GROUND_TOKEN),
    repository,
    voice: config.AGENT_VOICE_PROVIDER === "nvidia_nim"
      ? new NvidiaNimVoiceProvider({ asrUrl: config.AGENT_NIM_ASR_URL!, ttsUrl: config.AGENT_NIM_TTS_URL! })
      : config.AGENT_VOICE_PROVIDER === "elevenlabs"
        ? new ElevenLabsVoiceProvider({ apiKey: config.ELEVENLABS_API_KEY!, voiceId: config.ELEVENLABS_VOICE_ID!, modelId: config.ELEVENLABS_MODEL_ID })
        : null,
    checkIns: new CheckInService(repository),
    artifacts: artifactAi ? new ArtifactService({ repository, ...context, operationalAi: artifactAi, diaryAi: artifactAi, proposals: new ProposalService(new ScheduleValidatorImpl()) }) : null,
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
