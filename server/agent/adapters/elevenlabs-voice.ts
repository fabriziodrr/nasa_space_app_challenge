import { AUDIO_LIMITS } from "../contracts";
import type { VoiceProvider, ProviderOptions } from "../ports";
import { AgentError } from "../core/errors";
import { withDeadline } from "../core/deadline";

export const ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech";
export const DEFAULT_ELEVENLABS_MODEL = "eleven_multilingual_v2";

export interface ElevenLabsVoiceOptions {
  apiKey: string;
  voiceId: string;
  modelId?: string;
  fetch?: typeof fetch;
}

/** ElevenLabs text-to-speech (free plan requires public attribution). TTS only. */
export class ElevenLabsVoiceProvider implements VoiceProvider {
  private readonly fetcher: typeof fetch;
  private readonly modelId: string;

  constructor(private readonly options: ElevenLabsVoiceOptions) {
    if (!options.apiKey.trim() || !options.voiceId.trim()) {
      throw new Error("ElevenLabs requires an API key and a voice ID");
    }
    this.fetcher = options.fetch ?? fetch;
    this.modelId = options.modelId?.trim() || DEFAULT_ELEVENLABS_MODEL;
  }

  async transcribe(): Promise<never> {
    throw new AgentError(
      "PROVIDER_UNAVAILABLE",
      "Transcription is not provided by ElevenLabs in this demo: use the browser microphone.",
    );
  }

  async synthesize(
    input: Parameters<VoiceProvider["synthesize"]>[0],
    options?: ProviderOptions,
  ): Promise<{ audio: Uint8Array; mimeType: "audio/mpeg" }> {
    if (!input.text.trim() || input.text.length > 2000) {
      throw new AgentError("VALIDATION_ERROR", "Speech supports replies up to 2000 characters.");
    }
    return withDeadline(async (signal) => {
      let response: Response;
      try {
        response = await this.fetcher(`${ELEVENLABS_TTS_URL}/${encodeURIComponent(this.options.voiceId)}`, {
          method: "POST",
          headers: {
            "xi-api-key": this.options.apiKey.trim(),
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          signal,
          body: JSON.stringify({
            text: input.text,
            model_id: this.modelId,
            voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true },
          }),
        });
      } catch {
        if (signal.aborted) throw new AgentError("PROVIDER_TIMEOUT", "Voice service interrupted or timed out.", true);
        throw new AgentError("PROVIDER_UNAVAILABLE", "ElevenLabs voice service unreachable.", true);
      }
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 401) throw new AgentError("PROVIDER_UNAVAILABLE", "Invalid ElevenLabs key.");
        if (response.status === 429) throw new AgentError("RATE_LIMITED", "ElevenLabs plan limit reached.", true);
        throw new AgentError("PROVIDER_UNAVAILABLE", "ElevenLabs service unavailable.", response.status >= 500);
      }
      if (!response.body) throw new AgentError("PROVIDER_UNAVAILABLE", "Generated audio missing.");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > AUDIO_LIMITS.maxBytes) {
            await reader.cancel();
            throw new AgentError("PROVIDER_UNAVAILABLE", "Generated audio too large.");
          }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const audio = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { audio.set(chunk, offset); offset += chunk.length; }
      if (!audio.length) throw new AgentError("PROVIDER_UNAVAILABLE", "Generated audio empty.");
      return { audio, mimeType: "audio/mpeg" as const };
    }, AUDIO_LIMITS.providerTimeoutMs, options?.signal);
  }
}
