import { AUDIO_LIMITS, IdSchema, SpeechRequestSchema, TranscriptionMetadataSchema, TranscriptionResponseSchema } from "../contracts";
import { AgentError } from "../core/errors";
import { parsePcmWav } from "../voice/wav";
import type { AgentRuntime } from "../runtime";
import { createConversationHttpHandlers, readJson, response } from "./conversation-handlers";

async function multipart(request: Request): Promise<FormData> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;/i.test(contentType)) throw new AgentError("VALIDATION_ERROR", "Serve una richiesta multipart/form-data.");
  const limit = AUDIO_LIMITS.maxBytes + 128 * 1024;
  if (Number(request.headers.get("content-length")) > limit) throw new AgentError("PAYLOAD_TOO_LARGE", "Registrazione troppo grande.");
  if (!request.body) throw new AgentError("VALIDATION_ERROR", "Registrazione assente.");
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new AgentError("PAYLOAD_TOO_LARGE", "Registrazione troppo grande."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    return await new Request(request.url, { method: "POST", headers: { "Content-Type": contentType }, body: bytes.buffer }).formData();
  } catch { throw new AgentError("VALIDATION_ERROR", "Formato multipart non valido."); }
}

export function createVoiceHttpHandlers(getRuntime: () => AgentRuntime) {
  const { handle } = createConversationHttpHandlers(getRuntime);
  return {
    transcribe: (request: Request) => handle(request, async ({ repository, voice }, identity, requestId) => {
      if (identity.role !== "ASTRONAUT") throw new AgentError("FORBIDDEN", "Funzione riservata all'astronauta.");
      const form = await multipart(request);
      const allowed = ["audio", "sessionId", "durationSeconds"];
      if ([...form.keys()].some((key) => !allowed.includes(key)) || allowed.some((key) => form.getAll(key).length !== 1)) {
        throw new AgentError("VALIDATION_ERROR", "Campi audio mancanti, duplicati o sconosciuti.");
      }
      const sessionId = IdSchema.parse(form.get("sessionId"));
      const rawDuration = form.get("durationSeconds");
      if (typeof rawDuration !== "string" || !/^\d+(?:\.\d+)?$/.test(rawDuration)) throw new AgentError("VALIDATION_ERROR", "Durata dichiarata non valida.");
      const duration = Number(rawDuration);
      if (!Number.isFinite(duration) || duration <= 0 || duration > AUDIO_LIMITS.maxDurationSeconds) throw new AgentError("VALIDATION_ERROR", "Durata dichiarata fuori limite.");
      const file = form.get("audio");
      if (!(file instanceof File) || file.size === 0) throw new AgentError("VALIDATION_ERROR", "File audio assente o vuoto.");
      if (file.size > AUDIO_LIMITS.maxBytes) throw new AgentError("PAYLOAD_TOO_LARGE", "Registrazione troppo grande.");
      if (file.type.toLowerCase() !== "audio/wav") throw new AgentError("UNSUPPORTED_AUDIO", "Questo provider accetta file WAV PCM a 16 bit.");
      const session = await repository.getSessionState(identity.astronautId, sessionId);
      if (!session || session.session.astronautId !== identity.astronautId) throw new AgentError("NOT_FOUND", "Sessione non trovata.");
      if (session.session.closedAt || session.checkIn?.status === "CONFIRMED") throw new AgentError("INVALID_STATE", "Sessione conclusa.");
      if (!voice) throw new AgentError("PROVIDER_UNAVAILABLE", "Provider audio server non configurato. Usa la dettatura del browser.");
      const audio = new Uint8Array(await file.arrayBuffer());
      const wav = parsePcmWav(audio);
      // Declared duration is informational; the trusted duration is derived from PCM bytes.
      const metadata = TranscriptionMetadataSchema.parse({ sessionId, mimeType: "audio/wav", sizeBytes: audio.byteLength, durationSeconds: wav.durationSeconds });
      const result = await voice.transcribe({ audio, metadata }, { signal: request.signal });
      return response(TranscriptionResponseSchema, result, requestId);
    }),
    speech: (request: Request) => handle(request, async ({ repository, voice }, identity) => {
      if (identity.role !== "ASTRONAUT") throw new AgentError("FORBIDDEN", "Funzione riservata all'astronauta.");
      const body = SpeechRequestSchema.parse(await readJson(request));
      let cursor: string | undefined; const seen = new Set<string>();
      let text: string | undefined;
      do {
        const state = await repository.getSessionState(identity.astronautId, body.sessionId, cursor);
        if (!state || state.session.astronautId !== identity.astronautId) throw new AgentError("NOT_FOUND", "Sessione non trovata.");
        const message = state.messages.find((item) => item.id === body.messageId);
        if (message) {
          if (message.role !== "ASSISTANT" || message.sessionId !== body.sessionId) throw new AgentError("NOT_FOUND", "Messaggio non trovato.");
          text = message.text; break;
        }
        cursor = state.nextMessageCursor ?? undefined;
        if (cursor && seen.has(cursor)) throw new AgentError("INTERNAL_ERROR", "Paginazione non valida.");
        if (cursor) seen.add(cursor);
      } while (cursor);
      if (!text) throw new AgentError("NOT_FOUND", "Messaggio non trovato.");
      if (!voice) throw new AgentError("PROVIDER_UNAVAILABLE", "Provider audio server non configurato. Usa la lettura del browser.");
      const output = await voice.synthesize({ text, language: "en" }, { signal: request.signal });
      if (output.mimeType !== "audio/mpeg" || !output.audio.length || output.audio.length > AUDIO_LIMITS.maxBytes) {
        throw new AgentError("PROVIDER_UNAVAILABLE", "Audio generato non valido.");
      }
      return new Response(Uint8Array.from(output.audio).buffer, { status: 200, headers: {
        "Content-Type": "audio/mpeg", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
      } });
    }),
  };
}
