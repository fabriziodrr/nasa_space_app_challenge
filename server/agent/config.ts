import { z } from "zod";
import { ScenarioSchema } from "./contracts";

const ConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  AGENT_DEMO_ENABLED: z.enum(["true", "false"]).default("false"),
  AGENT_DEMO_TOKEN: z.string().min(16).max(512).optional(),
  AGENT_GROUND_TOKEN: z.string().min(16).max(512).optional(),
  AGENT_DEMO_SCENARIO: ScenarioSchema.default("RESTED"),
  AGENT_AI_PROVIDER: z.enum(["mock", "nvidia", "openai"]).default("mock"),
  AGENT_VOICE_PROVIDER: z.enum(["browser", "nvidia_nim", "elevenlabs"]).default("browser"),
  AGENT_NIM_ASR_URL: z.url().optional(),
  AGENT_NIM_TTS_URL: z.url().optional(),
  ELEVENLABS_API_KEY: z.string().trim().min(1).optional(),
  ELEVENLABS_VOICE_ID: z.string().trim().min(1).max(200).optional(),
  ELEVENLABS_MODEL_ID: z.string().trim().min(1).max(200).optional(),
  NVIDIA_API_KEY: z.string().trim().min(1).optional(),
  NVIDIA_MODEL: z.string().trim().min(1).max(200).optional(),
  OPENAI_API_KEY: z.string().trim().min(1).optional(),
  OPENAI_MODEL: z.string().trim().min(1).max(200).optional(),
  AGENT_AI_TIMEOUT_MS: z.coerce.number().int().min(100).max(120_000).default(30_000),
  AGENT_CONTEXT_MESSAGE_LIMIT: z.coerce.number().int().min(1).max(100).default(20),
  AGENT_PREVIOUS_CHECK_IN_LIMIT: z.coerce.number().int().min(0).max(10).default(3),
}).superRefine((config, ctx) => {
  if (config.AGENT_DEMO_ENABLED === "true") {
    if (config.NODE_ENV === "production") ctx.addIssue({ code: "custom", message: "Demo is forbidden in production" });
    if (!config.AGENT_DEMO_TOKEN) ctx.addIssue({ code: "custom", message: "Demo token is required" });
    if (config.AGENT_GROUND_TOKEN && config.AGENT_GROUND_TOKEN === config.AGENT_DEMO_TOKEN) ctx.addIssue({ code: "custom", message: "Ground token must differ from astronaut token" });
  }
  if (config.AGENT_AI_PROVIDER === "openai" && (!config.OPENAI_API_KEY || !config.OPENAI_MODEL)) {
    ctx.addIssue({ code: "custom", message: "OpenAI requires key and model" });
  }
  if (config.AGENT_AI_PROVIDER === "nvidia" && !config.NVIDIA_API_KEY) {
    ctx.addIssue({ code: "custom", message: "NVIDIA requires a server API key" });
  }
  if (config.AGENT_VOICE_PROVIDER === "nvidia_nim" && (!config.AGENT_NIM_ASR_URL || !config.AGENT_NIM_TTS_URL)) {
    ctx.addIssue({ code: "custom", message: "Local NVIDIA Speech NIM requires ASR and TTS origins" });
  }
  if (config.AGENT_VOICE_PROVIDER === "elevenlabs" && (!config.ELEVENLABS_API_KEY || !config.ELEVENLABS_VOICE_ID)) {
    ctx.addIssue({ code: "custom", message: "ElevenLabs requires an API key and a voice ID" });
  }
});

export function loadAgentConfig(environment: Record<string, string | undefined>) {
  const parsed = ConfigSchema.safeParse(environment);
  // Do not expose raw env values or secrets in a Zod error at startup.
  if (!parsed.success) throw new Error("Invalid agent configuration; see docs/agent/t1-conversation.md");
  return parsed.data;
}

export type AgentConfig = ReturnType<typeof loadAgentConfig>;
