import { speakEnglish, type SpeakHandle } from "./speech";

export interface ServerSpeechRequest {
  sessionId: string;
  messageId: string;
  /** Fallback text for the browser voice when the server route is unavailable. */
  text: string;
  token: string;
}

/**
 * Plays an assistant reply through the server voice route (e.g. ElevenLabs/NVIDIA),
 * falling back to the browser's speech synthesis when the route is not available.
 */
export function speakServerReply(
  request: ServerSpeechRequest,
  onEnd: () => void,
  onError: (message: string) => void,
): SpeakHandle {
  let cancelled = false;
  let current: SpeakHandle | null = null;

  (async () => {
    try {
      const response = await fetch("/api/agent/v1/voice/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(request.token ? { Authorization: `Bearer ${request.token}` } : {}) },
        body: JSON.stringify({ sessionId: request.sessionId, messageId: request.messageId }),
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      if (cancelled) return;
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      current = {
        cancel() {
          audio.pause();
          audio.src = "";
          URL.revokeObjectURL(url);
        },
      };
      audio.onended = () => { current = null; URL.revokeObjectURL(url); onEnd(); };
      audio.onerror = () => { current = null; URL.revokeObjectURL(url); onError("Unable to play the reply."); };
      await audio.play();
    } catch {
      if (cancelled) return;
      current = speakEnglish(request.text, onEnd, onError);
    }
  })();

  return { cancel() { cancelled = true; current?.cancel(); } };
}
