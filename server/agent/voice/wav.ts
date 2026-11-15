import { AgentError } from "../core/errors";

export interface PcmWav { channels: number; sampleRate: number; samples: Int16Array; durationSeconds: number }

/** Parse untrusted RIFF/WAVE PCM16, including optional chunks; no external process or temp file. */
export function parsePcmWav(bytes: Uint8Array, maxSeconds = 120): PcmWav {
  const invalid = () => new AgentError("UNSUPPORTED_AUDIO", "A valid 16-bit PCM WAV file is required.");
  if (bytes.length < 44) throw invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE" || view.getUint32(4, true) + 8 !== bytes.length) throw invalid();
  let channels = 0, rate = 0, align = 0, bits = 0, format = 0;
  let dataOffset = -1, dataSize = 0, hasFormat = false;
  for (let offset = 12; offset < bytes.length;) {
    if (offset + 8 > bytes.length) throw invalid();
    const size = view.getUint32(offset + 4, true);
    const end = offset + 8 + size;
    if (end > bytes.length || end + (size % 2) > bytes.length) throw invalid();
    if (tag(offset) === "fmt ") {
      if (hasFormat || size < 16) throw invalid();
      hasFormat = true;
      format = view.getUint16(offset + 8, true);
      channels = view.getUint16(offset + 10, true);
      rate = view.getUint32(offset + 12, true);
      const byteRate = view.getUint32(offset + 16, true);
      align = view.getUint16(offset + 20, true);
      bits = view.getUint16(offset + 22, true);
      if (byteRate !== rate * align) throw invalid();
    } else if (tag(offset) === "data") {
      if (dataOffset !== -1) throw invalid();
      dataOffset = offset + 8; dataSize = size;
    }
    offset = end + (size % 2);
  }
  if (!hasFormat || format !== 1 || ![1, 2].includes(channels) || bits !== 16
      || ![8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000].includes(rate)
      || align !== channels * 2 || dataOffset < 0 || dataSize === 0 || dataSize % align !== 0) throw invalid();
  const durationSeconds = dataSize / (rate * align);
  if (durationSeconds > maxSeconds) throw new AgentError("PAYLOAD_TOO_LARGE", "The recording exceeds the maximum allowed duration.");
  const samples = new Int16Array(dataSize / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(dataOffset + i * 2, true);
  return { channels, sampleRate: rate, samples, durationSeconds };
}
