"use client";

import { useEffect, useState } from "react";
import { pickEnglishVoice } from "../../client/voice/speech";

export function VoicePlayback({ text }: { text: string }) {
  const [error, setError] = useState("");
  useEffect(() => () => { window.speechSynthesis?.cancel(); }, []);

  function play() {
    setError("");
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      setError("Speech playback is unavailable. You can read the reply above.");
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      const voice = pickEnglishVoice();
      if (voice) utterance.voice = voice;
      utterance.onerror = () => setError("Unable to play the reply. You can read it above.");
      window.speechSynthesis.speak(utterance);
    } catch { setError("Unable to play the reply. You can read it above."); }
  }
  return <div>
    <button type="button" onClick={play}>Play reply</button>{" "}
    <button type="button" onClick={() => window.speechSynthesis?.cancel()}>Stop playback</button>
    {error && <p role="alert">{error}</p>}
  </div>;
}
