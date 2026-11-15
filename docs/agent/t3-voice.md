# T3: voice interface

Voice uses the same services and messages as text conversation. The standalone demo is available at `/voice-demo`: start the project according to [the T1 guide](t1-conversation.md), open the page, enter the local value `AGENT_DEMO_TOKEN` and create a session. The token is distinct from the NVIDIA key and remains in page state.

Two voice input modes:

- **Continuous conversation**: «Start conversation» starts a hands-free cycle. End of sentence is detected by a stable pause in transcription (no new word for about 2.5 s, adjustable via `quietMs` of the component): at that point the message is sent, the response is read aloud and listening resumes. «End conversation» interrupts the cycle. Detection is based on pause, not on sentence meaning analysis; the microphone must be allowed and an environment without the sound of the synthesis itself playing is recommended (e.g. headphones).
- **Manual mode**: press the microphone, dictate in Italian and press «End dictation». The transcription is editable and is sent only by pressing «Send». It is always possible to write.

The demo uses browser recognition and synthesis, which must be supported and enabled by the browser used. Recognition may send audio to a service chosen by the browser: offline operation is not guaranteed. It does not require a new application API key. Microphone and synthesis require a secure context, such as `localhost` or HTTPS.

## Optional voice APIs

For integrations independent of the interface, two authenticated routes are available with the same criteria as conversation routes. They are disabled by default. To enable them, install and start separately local NVIDIA Speech NIM services with ASR and TTS models supporting `it-IT`; consult NVIDIA documentation for hardware requirements, availability and terms. Configure in the `.env` file:

```dotenv
AGENT_VOICE_PROVIDER=nvidia_nim
AGENT_NIM_ASR_URL=http://127.0.0.1:9000
AGENT_NIM_TTS_URL=http://127.0.0.1:9001
```

Only loopback origins are accepted. Ports are examples and must match the started services. Restart the app after changes. The NVIDIA conversational model key does not start or configure these services. The browser demo does not depend on these routes.

- `POST /api/agent/v1/voice/transcriptions`: `multipart/form-data` with `sessionId`, `durationSeconds` and `audio` (file `audio/wav`, PCM 16 bit, mono or stereo). Limit 10 MB and 120 seconds; duration is verified from content. Returns `data.text` and `data.language`. The result is not automatically sent as a message: the interface must display it for correction and then use the normal messages API with `inputMode: "VOICE"`.
- `POST /api/agent/v1/voice/speech`: JSON `{ "sessionId": "...", "messageId": "..." }`; returns `audio/mpeg` for an assistant response belonging to the session of the authenticated astronaut. The provider supports texts up to 2000 characters. It does not accept arbitrary text.

Audio data is processed in memory, without temporary files or logging in the agent module. Routes return common contract errors; if services are not configured or reachable, they return `PROVIDER_UNAVAILABLE`. NIM adapters have been verified with mock services: for a full test, working local services are required. The `VoiceProvider` contract allows replacing the adapter without changing the dashboard.

### Optional ElevenLabs synthesis

For a more natural voice without starting local services, **ElevenLabs** synthesis is available (TTS only; transcription remains from the browser). Requires an ElevenLabs account and an API key. The free plan imposes **public attribution** ("powered by ElevenLabs"), already present on the demo page. Configure in `.env`:

```dotenv
AGENT_VOICE_PROVIDER=elevenlabs
ELEVENLABS_API_KEY=<chiave-api>
ELEVENLABS_VOICE_ID=<id-della-voce>
# ELEVENLABS_MODEL_ID=eleven_multilingual_v2
```

`ELEVENLABS_VOICE_ID` is found in the ElevenLabs voice catalog (select an Italian voice, its ID is visible in the card/URL). The default model `eleven_multilingual_v2` supports Italian. Check prices and limits on the ElevenLabs website: they may change. The demo first tries the `/voice/speech` route and falls back to browser synthesis if the route is not available.

References: [NVIDIA ASR API](https://docs.nvidia.com/nim/speech/26.10.0/reference/api-references/asr/http-asr.html), [NVIDIA TTS API](https://docs.nvidia.com/nim/speech/26.10.0/reference/api-references/tts/http-tts.html), [ElevenLabs Text-to-Speech](https://elevenlabs.io/docs/api-reference/text-to-speech/convert).
