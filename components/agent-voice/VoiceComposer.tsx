"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserVoiceInput, type RecognitionWindow } from "../../client/voice/recognition";

export interface VoiceComposerProps {
  disabled?: boolean;
  onSend(text: string, mode: "TEXT" | "VOICE"): Promise<void>;
}

const SILENCE_MS = 2000;
const START_GRACE_MS = 6000;

/** Reusable voice/text input; speech runs in the browser, send stays host-owned. */
export function VoiceComposer({ disabled = false, onSend }: VoiceComposerProps) {
  const [text, setText] = useState("");
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState("");
  const [voiceUsed, setVoiceUsed] = useState(false);
  const input = useRef<BrowserVoiceInput | null>(null);
  const base = useRef("");
  const running = useRef(false);
  const mounted = useRef(true);
  const quiet = useRef<ReturnType<typeof setTimeout> | null>(null);
  const captured = useRef(false);
  const finalSeen = useRef("");
  const interimSeen = useRef("");

  useEffect(() => {
    mounted.current = true;
    const clearQuiet = () => {
      if (quiet.current) { clearTimeout(quiet.current); quiet.current = null; }
    };
    const speech = new BrowserVoiceInput(window as unknown as RecognitionWindow, {
      onText(finalText, interimText) {
        finalSeen.current = finalText;
        interimSeen.current = interimText;
        const combined = [base.current, finalText].filter(Boolean).join(" ");
        setText(combined);
        if (combined.length > 8000) {
          setError("The message exceeds 8000 characters: shorten it before sending.");
          speech.stop();
        }
        setInterim(interimText);
        if (finalText) setVoiceUsed(true);
        if (finalText || interimText) captured.current = true;
        // Stop dictating after a stable pause instead of listening forever.
        clearQuiet();
        quiet.current = setTimeout(() => {
          quiet.current = null;
          if (captured.current) speech.stop();
        }, SILENCE_MS);
      },
      onEnd(hadTextOrError) {
        clearQuiet();
        // Browsers do not always flush the last interim words as final on stop.
        const merged = [base.current, finalSeen.current, interimSeen.current].filter(Boolean).join(" ").trim();
        if (merged) setText(merged);
        finalSeen.current = "";
        interimSeen.current = "";
        setListening(false);
        setInterim("");
        if (!hadTextOrError && !captured.current) setError("No words detected. Try again or type the message.");
        captured.current = false;
      },
      onError(message) { clearQuiet(); captured.current = false; setError(message); },
    });
    input.current = speech;
    // Browser support is established only after hydration.
    queueMicrotask(() => { if (mounted.current) setSupported(speech.supported); });
    return () => { mounted.current = false; clearQuiet(); speech.dispose(); input.current = null; };
  }, []);

  useEffect(() => {
    if (disabled) input.current?.stop();
  }, [disabled]);

  async function send() {
    const trimmed = text.trim();
    if (running.current || disabled || listening || !trimmed || trimmed.length > 8000) return;
    running.current = true;
    setBusy(true); setError("");
    try {
      await onSend(trimmed, voiceUsed ? "VOICE" : "TEXT");
      if (mounted.current) { setText(""); setVoiceUsed(false); }
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : "Send failed. Try again.");
    } finally { running.current = false; if (mounted.current) setBusy(false); }
  }

  function start() {
    if (disabled || busy || listening) return;
    setError(""); setInterim("");
    base.current = text.trim();
    captured.current = false;
    window.speechSynthesis?.cancel();
    try {
      input.current?.start();
      setListening(true);
      if (quiet.current) clearTimeout(quiet.current);
      // Safety net: stop listening even if nothing is recognized at all.
      quiet.current = setTimeout(() => {
        quiet.current = null;
        input.current?.stop();
      }, START_GRACE_MS);
    } catch { setError("Unable to start the microphone. Check permissions or type the message."); }
  }

  return <section aria-label="Type or dictate a message">
    <p>You can dictate in English and edit the text before sending. Recognition depends on the browser and may use an online service.</p>
    <label htmlFor="agent-message">Message</label>
    <textarea id="agent-message" rows={4} maxLength={8000} value={text} disabled={disabled || listening || busy}
      onChange={(event) => { setText(event.target.value); if (!event.target.value) setVoiceUsed(false); }} placeholder="Type or use the microphone" />
    {interim && <p aria-live="polite">Listening: {interim}</p>}
    <div className="voice-actions">
      {!listening ? <button type="button" onClick={start} disabled={disabled || busy || !supported}>Start microphone</button>
        : <button type="button" onClick={() => input.current?.stop()}>End dictation</button>}
      <button type="button" onClick={send} disabled={disabled || listening || busy || !text.trim() || text.trim().length > 8000}>{busy ? "Sending…" : "Send message"}</button>
    </div>
    {!supported && <p>Voice recognition is not available in this browser; you can type the message.</p>}
    {listening && <p role="status">Microphone active. Dictation stops after at most two minutes.</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
