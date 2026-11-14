import { ERROR_HTTP_STATUS, type ErrorCode } from "../contracts";

const AGENT_ERROR_BRAND = Symbol.for("iss.agent.AgentError");

export class AgentError extends Error {
  readonly [AGENT_ERROR_BRAND] = true;
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "AgentError";
  }
}

// Next bundles routes independently. Shared development runtime errors may come
// from another copy of this module, so instanceof alone is not a stable boundary.
// JSON/user input cannot forge a symbol-keyed brand.
export function isAgentError(value: unknown): value is AgentError {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Record<PropertyKey, unknown>;
  return candidate[AGENT_ERROR_BRAND] === true
    && typeof candidate.code === "string" && Object.hasOwn(ERROR_HTTP_STATUS, candidate.code)
    && typeof candidate.message === "string" && candidate.message.length > 0 && candidate.message.length <= 8000
    && typeof candidate.retryable === "boolean";
}

export function invalidAiOutput(): AgentError {
  return new AgentError("INVALID_AI_OUTPUT", "La risposta AI non e valida. Il check-in non e stato modificato.");
}

export function sameMessage(
  a: { clientMessageId: string; text: string; inputMode: string },
  b: { clientMessageId: string; text: string; inputMode: string },
): boolean {
  return a.clientMessageId === b.clientMessageId && a.text === b.text && a.inputMode === b.inputMode;
}
