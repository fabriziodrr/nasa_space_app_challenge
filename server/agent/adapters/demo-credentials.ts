import { createHmac, randomBytes } from "node:crypto";
import { demoCrewMappings } from "../demo-crew";

// Credentials for fictional local profiles are kept on the server. Explicitly
// configured values always take precedence and remain compatible with scripts.
const state = globalThis as typeof globalThis & { __aegisDemoCrewCredentials?: Record<string, string> };

export function demoCrewCredentials(environment: Record<string, string | undefined> = process.env): Record<string, string | undefined> {
  const generated = state.__aegisDemoCrewCredentials ??= Object.fromEntries(
    demoCrewMappings.slice(1).map((member) => [member.tokenEnv, randomBytes(32).toString("hex")]),
  );
  return Object.fromEntries(demoCrewMappings.slice(1).map((member) => [member.tokenEnv, environment[member.tokenEnv]
    || (environment.AGENT_DEMO_TOKEN ? createHmac("sha256", environment.AGENT_DEMO_TOKEN).update(`aegis-demo-crew:${member.astronautId}`).digest("hex") : generated[member.tokenEnv])]));
}
