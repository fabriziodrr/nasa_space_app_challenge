import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  ApiErrorSchema, CONTRACT_VERSION, CreateSessionResponseSchema, ERROR_HTTP_STATUS,
  IdentitySchema, MessageResponseSchema, SessionResponseSchema,
} from "../contracts";
import { AgentError, isAgentError } from "../core/errors";
import type { ConversationService } from "../core/conversation-service";
import type { IdentityProvider } from "../ports";

interface HttpRuntime { identity: IdentityProvider; service: ConversationService }
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

async function readJson(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new AgentError("VALIDATION_ERROR", "Il corpo deve essere JSON con Content-Type application/json.");
  }
  const limit = 64 * 1024;
  if (Number(request.headers.get("content-length")) > limit) throw new AgentError("PAYLOAD_TOO_LARGE", "Richiesta troppo grande.");
  if (!request.body) throw new AgentError("VALIDATION_ERROR", "Corpo JSON richiesto.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new AgentError("PAYLOAD_TOO_LARGE", "Richiesta troppo grande.");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new AgentError("VALIDATION_ERROR", "JSON non valido."); }
}

function response<S extends z.ZodType>(schema: S, data: unknown, requestId: string, status = 200) {
  const result = schema.safeParse({ data, meta: { contractVersion: CONTRACT_VERSION, requestId } });
  if (!result.success) throw new AgentError("INTERNAL_ERROR", "Risposta del servizio non valida.");
  return Response.json(result.data, { status, headers: { ...headers, "X-Request-ID": requestId } });
}

export function createConversationHttpHandlers(getRuntime: () => HttpRuntime) {
  async function handle(
    request: Request,
    action: (runtime: HttpRuntime, identity: z.infer<typeof IdentitySchema>, requestId: string) => Promise<Response>,
  ) {
    const requestId = randomUUID();
    try {
      const origin = request.headers.get("origin");
      if (request.headers.has("cookie") && origin && origin !== new URL(request.url).origin) {
        throw new AgentError("FORBIDDEN", "Origine della richiesta non consentita.");
      }
      const runtime = getRuntime();
      const identity = await runtime.identity.authenticate({
        authorizationHeader: request.headers.get("authorization"), sessionCookie: request.headers.get("cookie"),
      });
      if (!identity) throw new AgentError("UNAUTHENTICATED", "Autenticazione richiesta.");
      const parsedIdentity = IdentitySchema.safeParse(identity);
      if (!parsedIdentity.success) throw new AgentError("INTERNAL_ERROR", "Identita del servizio non valida.");
      return await action(runtime, parsedIdentity.data, requestId);
    } catch (error) {
      const known = isAgentError(error) ? error : null;
      const validation = error instanceof z.ZodError ? error : null;
      const code = known?.code ?? (validation ? "VALIDATION_ERROR" : "INTERNAL_ERROR");
      const body = ApiErrorSchema.parse({ error: {
        code, message: known?.message ?? (validation ? "Parametri della richiesta non validi." : "Errore interno del modulo agent."),
        requestId, retryable: known?.retryable ?? false,
        issues: validation?.issues.slice(0, 100).map((issue) => ({
          path: issue.path.map(String).join(".").slice(0, 200), message: "Valore non valido.",
        })) ?? [],
        ...(known?.currentVersion === undefined ? {} : { currentVersion: known.currentVersion }),
      } });
      return Response.json(body, {
        status: ERROR_HTTP_STATUS[code], headers: { ...headers, "X-Request-ID": requestId },
      });
    }
  }

  return {
    createSession: (request: Request) => handle(request, async ({ service }, identity, requestId) =>
      response(CreateSessionResponseSchema, await service.createSession(identity, await readJson(request)), requestId, 201)),
    getSession: (request: Request, sessionId: string) => handle(request, async ({ service }, identity, requestId) => {
      const query: Record<string, string> = {};
      for (const [key, value] of new URL(request.url).searchParams) {
        if (key in query) throw new AgentError("VALIDATION_ERROR", "Parametro query duplicato.");
        query[key] = value;
      }
      return response(SessionResponseSchema, await service.getSession(identity, sessionId, query), requestId);
    }),
    sendMessage: (request: Request, sessionId: string) => handle(request, async ({ service }, identity, requestId) =>
      response(MessageResponseSchema, await service.sendMessage(identity, sessionId, await readJson(request), request.signal), requestId)),
  };
}
