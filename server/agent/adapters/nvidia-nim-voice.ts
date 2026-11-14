import { z } from "zod";
import { AUDIO_LIMITS, TranscriptionResultSchema } from "../contracts";
import type { VoiceProvider, ProviderOptions } from "../ports";
import { AgentError } from "../core/errors";
import { withDeadline } from "../core/deadline";
import { parsePcmWav } from "../voice/wav";

function localUrl(value: string): string {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("NVIDIA Speech NIM must use a local origin");
  }
  return url.origin;
}

export class NvidiaNimVoiceProvider implements VoiceProvider {
  private readonly asrUrl: string;
  private readonly ttsUrl: string;
  private readonly fetcher: typeof fetch;
  constructor(options: { asrUrl: string; ttsUrl: string; fetch?: typeof fetch }) {
    this.asrUrl = localUrl(options.asrUrl);
    this.ttsUrl = localUrl(options.ttsUrl);
    this.fetcher = options.fetch ?? fetch;
  }

  private async post(url: string, form: FormData, signal: AbortSignal): Promise<Response> {
    let response: Response;
    try { response = await this.fetcher(url, { method: "POST", body: form, signal }); }
    catch {
      if (signal.aborted) throw new AgentError("PROVIDER_TIMEOUT", "Servizio vocale interrotto o scaduto.", true);
      throw new AgentError("PROVIDER_UNAVAILABLE", "Servizio vocale locale non raggiungibile.", true);
    }
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 429) throw new AgentError("RATE_LIMITED", "Servizio vocale occupato. Riprova.", true);
      throw new AgentError("PROVIDER_UNAVAILABLE", "Servizio vocale locale non disponibile.", response.status >= 500);
    }
    return response;
  }

  async transcribe(input: Parameters<VoiceProvider["transcribe"]>[0], options?: ProviderOptions) {
    const wav = parsePcmWav(input.audio);
    if (input.metadata.mimeType !== "audio/wav" || input.metadata.sizeBytes !== input.audio.byteLength
        || Math.abs(input.metadata.durationSeconds - wav.durationSeconds) > 0.01) {
      throw new AgentError("VALIDATION_ERROR", "I metadati audio non corrispondono al file.");
    }
    return withDeadline(async (signal) => {
      const form = new FormData();
      form.set("file", new Blob([Uint8Array.from(input.audio).buffer], { type: "audio/wav" }), "audio.wav");
      form.set("language", "it-IT"); form.set("response_format", "json");
      const response = await this.post(`${this.asrUrl}/v1/audio/transcriptions`, form, signal);
      let data: unknown;
      try { data = await response.json(); } catch { throw new AgentError("INVALID_AI_OUTPUT", "Trascrizione non valida."); }
      const parsed = z.object({ text: z.string().trim().min(1).max(8000) }).safeParse(data);
      if (!parsed.success) throw new AgentError("INVALID_AI_OUTPUT", "Trascrizione non valida.");
      return TranscriptionResultSchema.parse({ text: parsed.data.text, language: "it" });
    }, AUDIO_LIMITS.providerTimeoutMs, options?.signal);
  }

  async synthesize(input: Parameters<VoiceProvider["synthesize"]>[0], options?: ProviderOptions) {
    if (!input.text.trim() || input.text.length > 2000) throw new AgentError("VALIDATION_ERROR", "La lettura supporta risposte fino a 2000 caratteri.");
    return withDeadline(async (signal) => {
      const form = new FormData(); form.set("text", input.text); form.set("language", "it-IT");
      const response = await this.post(`${this.ttsUrl}/v1/audio/synthesize`, form, signal);
      const declared = Number(response.headers.get("content-length"));
      if (declared > AUDIO_LIMITS.maxBytes) { await response.body?.cancel(); throw new AgentError("PROVIDER_UNAVAILABLE", "Audio generato troppo grande."); }
      if (!response.body) throw new AgentError("PROVIDER_UNAVAILABLE", "Audio generato assente.");
      const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read(); if (done) break;
          size += value.byteLength;
          if (size > AUDIO_LIMITS.maxBytes) { await reader.cancel(); throw new AgentError("PROVIDER_UNAVAILABLE", "Audio generato troppo grande."); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      let wav: ReturnType<typeof parsePcmWav>;
      try { wav = parsePcmWav(bytes, 240); }
      catch { throw new AgentError("PROVIDER_UNAVAILABLE", "Audio generato non valido."); }
      const { Mp3Encoder } = await import("@breezystack/lamejs");
      const encoder = new Mp3Encoder(wav.channels, wav.sampleRate, 128);
      const encoded: Uint8Array[] = [];
      for (let i = 0; i < wav.samples.length / wav.channels; i += 1152) {
        if (signal.aborted) throw new AgentError("PROVIDER_TIMEOUT", "Lettura interrotta.", true);
        const count = Math.min(1152, wav.samples.length / wav.channels - i);
        const left = new Int16Array(count), right = wav.channels === 2 ? new Int16Array(count) : undefined;
        for (let j = 0; j < count; j++) {
          left[j] = wav.samples[(i + j) * wav.channels];
          if (right) right[j] = wav.samples[(i + j) * wav.channels + 1];
        }
        const part = encoder.encodeBuffer(left, right); if (part.length) encoded.push(Uint8Array.from(part));
      }
      const tail = encoder.flush(); if (tail.length) encoded.push(Uint8Array.from(tail));
      const result = new Uint8Array(encoded.reduce((sum, part) => sum + part.length, 0));
      let position = 0; for (const part of encoded) { result.set(part, position); position += part.length; }
      if (!result.length) throw new AgentError("PROVIDER_UNAVAILABLE", "Audio generato vuoto.");
      return { audio: result, mimeType: "audio/mpeg" as const };
    }, AUDIO_LIMITS.providerTimeoutMs, options?.signal);
  }
}
