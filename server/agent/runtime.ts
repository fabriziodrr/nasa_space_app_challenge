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
import { VisionService } from "./vision/service";
import { VisionConfirmationService } from "./vision/confirmation";

function createDemoRuntime() {
  const config = loadAgentConfig(process.env);
  if (config.AGENT_DEMO_ENABLED !== "true") {
    throw new AgentError("PROVIDER_UNAVAILABLE", "Modulo agent non configurato. Collegare gli adattatori o abilitare la demo locale.");
  }
  const repository = new PrismaAgentRepository(prisma);
  const context = createDemoContextProviders(config.AGENT_DEMO_SCENARIO);
  const visionQuality = { minValidMs: config.AGENT_VISION_MIN_VALID_MS, minCoverage: config.AGENT_VISION_MIN_COVERAGE,
    maxAgeMinutes: config.AGENT_VISION_MAX_AGE_MINUTES };
  const visionObservations = new VisionService(prisma, visionQuality);
  const visionConfirmation = new VisionConfirmationService(prisma, context.sensors, visionQuality);
  const ai = createConversationAiProvider(config);
  const artifactAi = config.AGENT_AI_PROVIDER === "nvidia"
    ? new NvidiaConversationProvider({ apiKey: config.NVIDIA_API_KEY!, model: config.NVIDIA_MODEL, timeoutMs: config.AGENT_AI_TIMEOUT_MS })
    : config.AGENT_AI_PROVIDER === "mock" ? new MockConversationAiProvider() : null;
  return {
    identity: new DemoIdentityProvider(config.AGENT_DEMO_TOKEN!, config.AGENT_GROUND_TOKEN),
    repository,
    visionObservations,
    visionConfirmation,
    voice: config.AGENT_VOICE_PROVIDER === "nvidia_nim"
      ? new NvidiaNimVoiceProvider({ asrUrl: config.AGENT_NIM_ASR_URL!, ttsUrl: config.AGENT_NIM_TTS_URL! }) : null,
    checkIns: new CheckInService(repository, visionConfirmation),
    artifacts: artifactAi ? new ArtifactService({ repository, ...context, frozenContext: visionConfirmation, operationalAi: artifactAi, diaryAi: artifactAi, proposals: new ProposalService(new ScheduleValidatorImpl()) }) : null,
    service: createConversationService({
      ai, repository, ...context, vision: visionObservations, timeoutMs: config.AGENT_AI_TIMEOUT_MS,
      visionQuality,
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
