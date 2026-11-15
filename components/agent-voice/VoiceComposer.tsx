"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserVoiceInput, type RecognitionWindow } from "../../client/voice/recognition";

export interface VoiceComposerProps {
  disabled?: boolean;
  onSend(text: string, mode: "TEXT" | "VOICE"): Promise<void>;
}

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

  useEffect(() => {
    mounted.current = true;
    const speech = new BrowserVoiceInput(window as unknown as RecognitionWindow, {
      onText(finalText, interimText) {
        const combined = [base.current, finalText].filter(Boolean).join(" ");
        setText(combined);
        if (combined.length > 8000) {
          setError("Your message exceeds 8,000 characters. Shorten it before sending.");
          speech.stop();
        }
        setInterim(interimText);
        if (finalText) setVoiceUsed(true);
      },
      onEnd(hadTextOrError) {
        setListening(false);
        setInterim("");
        if (!hadTextOrError) setError("No speech detected. Try again or type your message.");
      },
      onError(message) { setError(message); },
    });
    input.current = speech;
    // Browser support is established only after hydration.
    queueMicrotask(() => { if (mounted.current) setSupported(speech.supported); });
    return () => { mounted.current = false; speech.dispose(); input.current = null; };
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
      if (mounted.current) setError(e instanceof Error ? e.message : "Message could not be sent. Try again.");
    } finally { running.current = false; if (mounted.current) setBusy(false); }
  }

  function start() {
    if (disabled || busy || listening) return;
    setError(""); setInterim("");
    base.current = text.trim();
    window.speechSynthesis?.cancel();
    try { input.current?.start(); setListening(true); }
    catch { setError("Unable to start the microphone. Check permissions or type your message."); }
  }

  return <section aria-label="Type or dictate a message">
    <p>You can dictate in English and edit before sending. Speech recognition depends on your browser and may use an online service.</p>
    <label htmlFor="agent-message">Message</label>
    <textarea id="agent-message" rows={4} maxLength={8000} value={text} disabled={disabled || listening || busy}
      onChange={(event) => { setText(event.target.value); if (!event.target.value) setVoiceUsed(false); }} placeholder="Type or use the microphone" />
    {interim && <p aria-live="polite">Listening: {interim}</p>}
    <div className="voice-actions">
      {!listening ? <button type="button" onClick={start} disabled={disabled || busy || !supported}>Start microphone</button>
        : <button type="button" onClick={() => input.current?.stop()}>Stop dictation</button>}
      <button type="button" onClick={send} disabled={disabled || listening || busy || !text.trim() || text.trim().length > 8000}>{busy ? "Sending…" : "Send message"}</button>
    </div>
    {!supported && <p>Speech recognition is unavailable in this browser; you can type your message.</p>}
    {listening && <p role="status">Microphone active. Dictation ends after a maximum of two minutes.</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
