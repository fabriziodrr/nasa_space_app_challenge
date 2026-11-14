import assert from "node:assert/strict";
import { test } from "node:test";
import { NvidiaNimVoiceProvider } from "../../server/agent/adapters/nvidia-nim-voice";
import { parsePcmWav } from "../../server/agent/voice/wav";
import { createVoiceHttpHandlers } from "../../server/agent/http/voice-handlers";
import type { AgentRuntime } from "../../server/agent/runtime";

function wav(seconds = 0.1, rate = 16000): Uint8Array<ArrayBuffer> {
  const samples = Math.floor(seconds * rate);
  const bytes = new Uint8Array(44 + samples * 2); const view = new DataView(bytes.buffer);
  const tag = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i); };
  tag(0, "RIFF"); view.setUint32(4, bytes.length - 8, true); tag(8, "WAVE"); tag(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true);
  view.setUint16(34, 16, true); tag(36, "data"); view.setUint32(40, samples * 2, true);
  return bytes;
}

test("WAV validation derives duration from samples and rejects malformed or excessive audio", () => {
  assert.equal(parsePcmWav(wav()).durationSeconds, 0.1);
  assert.throws(() => parsePcmWav(new Uint8Array(44)), /WAV/);
  assert.throws(() => parsePcmWav(wav(121, 8000)), /durata/);
  const bad = wav(); new DataView(bad.buffer).setUint16(34, 8, true);
  assert.throws(() => parsePcmWav(bad), /WAV/);
});

test("local NIM adapter sends Italian audio and encodes returned WAV as MP3", async () => {
  const requests: string[] = [];
  const fakeFetch: typeof fetch = async (url, init) => {
    requests.push(String(url)); const form = init?.body as FormData;
    assert.equal(form.get("language"), "it-IT");
    if (String(url).endsWith("transcriptions")) {
      assert.equal((form.get("file") as File).type, "audio/wav");
      return Response.json({ text: "Ho dormito bene" });
    }
    assert.equal(form.get("text"), "Ciao");
    return new Response(wav().buffer, { headers: { "content-type": "audio/wav" } });
  };
  const provider = new NvidiaNimVoiceProvider({ asrUrl: "http://localhost:9000", ttsUrl: "http://127.0.0.1:9001", fetch: fakeFetch });
  const audio = wav();
  assert.equal((await provider.transcribe({ audio, metadata: { sessionId: "s1", mimeType: "audio/wav", sizeBytes: audio.length, durationSeconds: 0.1 } })).text, "Ho dormito bene");
  const output = await provider.synthesize({ text: "Ciao", language: "it" });
  assert.equal(output.mimeType, "audio/mpeg"); assert.ok(output.audio.length > 100);
  assert.equal(output.audio[0], 0xff); assert.equal(output.audio[1] & 0xe0, 0xe0);
  assert.equal(requests.length, 2);
  assert.throws(() => new NvidiaNimVoiceProvider({ asrUrl: "https://example.com", ttsUrl: "http://localhost" }), /local origin/);
});

test("voice routes enforce identity and only synthesize assistant messages of the owned session", async () => {
  let identity: unknown = { userId: "u1", role: "ASTRONAUT", astronautId: "a1" };
  let observedDuration = 0;
  const runtime = {
    identity: { authenticate: async () => identity },
    repository: { getSessionState: async (astronautId: string, sessionId: string) => astronautId !== "a1" || sessionId !== "s1" ? null : ({
      session: { astronautId: "a1", closedAt: null }, checkIn: null, nextMessageCursor: null,
      messages: [{ id: "m1", sessionId: "s1", role: "ASSISTANT", text: "Ciao" }, { id: "m2", sessionId: "s1", role: "ASTRONAUT", text: "Privato" }],
    }) },
    voice: { transcribe: async (input: { metadata: { durationSeconds: number } }) => { observedDuration = input.metadata.durationSeconds; return { text: "ciao", language: "it" }; },
      synthesize: async () => ({ audio: new Uint8Array([1, 2]), mimeType: "audio/mpeg" }) },
  } as unknown as AgentRuntime;
  const handlers = createVoiceHttpHandlers(() => runtime);
  const speech = (sessionId: string, messageId: string) => new Request("http://localhost/voice/speech", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId, messageId }) });
  assert.equal((await handlers.speech(speech("s1", "m1"))).status, 200);
  assert.equal((await handlers.speech(speech("s1", "m2"))).status, 404);
  assert.equal((await handlers.speech(speech("other", "m1"))).status, 404);
  const form = new FormData(); form.set("sessionId", "s1"); form.set("durationSeconds", "1");
  form.set("audio", new Blob([wav().buffer], { type: "audio/wav" }), "test.wav");
  assert.equal((await handlers.transcribe(new Request("http://localhost/voice/transcriptions", { method: "POST", body: form }))).status, 200);
  assert.equal(observedDuration, 0.1);
  identity = null;
  assert.equal((await handlers.speech(speech("s1", "m1"))).status, 401);
  identity = { userId: "g1", role: "GROUND_CONTROL", astronautIds: ["a1"] };
  assert.equal((await handlers.speech(speech("s1", "m1"))).status, 403);
});
