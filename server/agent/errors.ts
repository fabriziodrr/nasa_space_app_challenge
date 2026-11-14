// Server-side error type mapped to the public ApiError contract by HTTP adapters.
import { ERROR_HTTP_STATUS, type ApiError, type ErrorCode } from "./contracts";

export interface ServiceIssue { path: string; message: string }

export class AgentServiceError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly issues: ServiceIssue[];
  readonly currentVersion?: number;
  readonly requestId: string;

  constructor(opts: {
    code: ErrorCode;
    message: string;
    retryable?: boolean;
    issues?: ServiceIssue[];
    currentVersion?: number;
    requestId?: string;
  }) {
    super(opts.message);
    this.name = "AgentServiceError";
    this.code = opts.code;
    this.retryable = opts.retryable ?? false;
    this.issues = opts.issues ?? [];
    this.currentVersion = opts.currentVersion;
    this.requestId = opts.requestId ?? defaultRequestId();
  }

  get httpStatus(): number {
    return ERROR_HTTP_STATUS[this.code];
  }

  toApiError(requestId?: string): ApiError {
    return {
      error: {
        code: this.code,
        message: this.message,
        requestId: requestId ?? this.requestId,
        retryable: this.retryable,
        issues: this.issues,
        ...(this.currentVersion === undefined ? {} : { currentVersion: this.currentVersion }),
      },
    };
  }
}

export function defaultRequestId(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return `req-${cryptoObj.randomUUID()}`;
  }
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function agentError(
  code: ErrorCode,
  message: string,
  extra: { retryable?: boolean; issues?: ServiceIssue[]; currentVersion?: number } = {},
): AgentServiceError {
  return new AgentServiceError({ code, message, ...extra });
}

export const AgentErrors = {
  notFound: (message = "Risorsa non trovata o non accessibile.") =>
    agentError("NOT_FOUND", message),
  forbidden: (message = "Operazione non consentita per il ruolo corrente.") =>
    agentError("FORBIDDEN", message),
  invalidState: (message: string) => agentError("INVALID_STATE", message),
  versionConflict: (message: string, currentVersion: number) =>
    agentError("VERSION_CONFLICT", message, { currentVersion }),
  idempotencyConflict: (message = "Richiesta ripetuta con payload o operatore differente.") =>
    agentError("IDEMPOTENCY_CONFLICT", message),
  invalidAiOutput: (message = "Output del provider non valido.") =>
    agentError("INVALID_AI_OUTPUT", message),
  internal: (message = "Errore interno.") => agentError("INTERNAL_ERROR", message, { retryable: true }),
};
