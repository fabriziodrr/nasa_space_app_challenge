"use client";

import { useEffect, useState } from "react";

export function VoicePlayback({ text }: { text: string }) {
  const [error, setError] = useState("");
  useEffect(() => () => { window.speechSynthesis?.cancel(); }, []);

  function play() {
    setError("");
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      setError("Lettura vocale non disponibile. Puoi leggere la risposta sopra.");
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "it-IT";
      const voice = window.speechSynthesis.getVoices().find((item) => item.lang.toLowerCase().startsWith("it"));
      if (voice) utterance.voice = voice;
      utterance.onerror = () => setError("Impossibile riprodurre la risposta. Puoi leggerla sopra.");
      window.speechSynthesis.speak(utterance);
    } catch { setError("Impossibile riprodurre la risposta. Puoi leggerla sopra."); }
  }
  return <div>
    <button type="button" onClick={play}>Ascolta risposta</button>{" "}
    <button type="button" onClick={() => window.speechSynthesis?.cancel()}>Interrompi lettura</button>
    {error && <p role="alert">{error}</p>}
  </div>;
}
