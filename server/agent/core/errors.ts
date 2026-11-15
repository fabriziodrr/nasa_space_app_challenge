import { ERROR_HTTP_STATUS, type ErrorCode } from "../contracts";

const AGENT_ERROR_BRAND = Symbol.for("iss.agent.AgentError");

export class AgentError extends Error {
  readonly [AGENT_ERROR_BRAND] = true;
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly retryable = false,
    public readonly currentVersion?: number,
  ) {
    super(message);
    this.name = "AgentError";
  }
}

export function notFound(message = "Resource not found or not accessible."): AgentError {
  return new AgentError("NOT_FOUND", message);
}

export function forbidden(message = "Operation not allowed for the current role."): AgentError {
  return new AgentError("FORBIDDEN", message);
}

export function invalidState(message: string): AgentError {
  return new AgentError("INVALID_STATE", message);
}

export function versionConflict(message: string, currentVersion: number): AgentError {
  return new AgentError("VERSION_CONFLICT", message, false, currentVersion);
}

export function idempotencyConflict(message = "Request repeated with a different payload or operator."): AgentError {
  return new AgentError("IDEMPOTENCY_CONFLICT", message);
}

export function internal(message = "Internal error."): AgentError {
  return new AgentError("INTERNAL_ERROR", message, true);
}

export const AgentErrors = {
  notFound,
  forbidden,
  invalidState,
  versionConflict,
  idempotencyConflict,
  internal,
  invalidAiOutput,
} as const;

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

export function invalidAiOutput(message = "The AI response is invalid. The check-in was not modified."): AgentError {
  return new AgentError("INVALID_AI_OUTPUT", message);
}

export function sameMessage(
  a: { clientMessageId: string; text: string; inputMode: string },
  b: { clientMessageId: string; text: string; inputMode: string },
): boolean {
  return a.clientMessageId === b.clientMessageId && a.text === b.text && a.inputMode === b.inputMode;
}
