import { z } from "zod";
import { ScenarioSchema } from "./contracts";

const ConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  AGENT_DEMO_ENABLED: z.enum(["true", "false"]).default("false"),
  AGENT_DEMO_TOKEN: z.string().min(16).max(512).optional(),
  AGENT_DEMO_SCENARIO: ScenarioSchema.default("RESTED"),
  AGENT_AI_PROVIDER: z.enum(["mock", "openai"]).default("mock"),
  OPENAI_API_KEY: z.string().trim().min(1).optional(),
  OPENAI_MODEL: z.string().trim().min(1).max(200).optional(),
  AGENT_AI_TIMEOUT_MS: z.coerce.number().int().min(100).max(120_000).default(30_000),
  AGENT_CONTEXT_MESSAGE_LIMIT: z.coerce.number().int().min(1).max(100).default(20),
  AGENT_PREVIOUS_CHECK_IN_LIMIT: z.coerce.number().int().min(0).max(10).default(3),
}).superRefine((config, ctx) => {
  if (config.AGENT_DEMO_ENABLED === "true") {
    if (config.NODE_ENV === "production") ctx.addIssue({ code: "custom", message: "Demo is forbidden in production" });
    if (!config.AGENT_DEMO_TOKEN) ctx.addIssue({ code: "custom", message: "Demo token is required" });
  }
  if (config.AGENT_AI_PROVIDER === "openai" && (!config.OPENAI_API_KEY || !config.OPENAI_MODEL)) {
    ctx.addIssue({ code: "custom", message: "OpenAI requires key and model" });
  }
});

export function loadAgentConfig(environment: Record<string, string | undefined>) {
  const parsed = ConfigSchema.safeParse(environment);
  // Do not expose raw env values or secrets in a Zod error at startup.
  if (!parsed.success) throw new Error("Invalid agent configuration; see docs/agent/t1-conversation.md");
  return parsed.data;
}

export type AgentConfig = ReturnType<typeof loadAgentConfig>;
