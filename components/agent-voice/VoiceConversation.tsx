"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserVoiceInput, type RecognitionWindow } from "../../client/voice/recognition";
import type { SpeakHandle } from "../../client/voice/speech";

type Phase = "idle" | "listening" | "thinking" | "speaking";

export interface SpeakableReply { text: string; messageId: string }

export interface VoiceConversationProps {
  disabled?: boolean;
  /** Sends a voice message and resolves with the assistant's reply. */
  onSend(text: string): Promise<SpeakableReply>;
  /** Plays the assistant's reply (server or browser); resolves via onEnd when done. */
  onSpeak(reply: SpeakableReply, onEnd: () => void, onError: (message: string) => void): SpeakHandle;
  /** Silence (no new recognized words) before considering the sentence finished. */
  quietMs?: number;
}

/**
 * Hands-free loop: listen, detect the end of the sentence by a stable pause in the
 * transcript (not by the browser's own stop), send, speak the reply, then listen again.
 */
export function VoiceConversation({ disabled = false, onSend, onSpeak, quietMs = 2500 }: VoiceConversationProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const [supported, setSupported] = useState(false);

  const input = useRef<BrowserVoiceInput | null>(null);
  const active = useRef(false);
  const finalRef = useRef("");
  const interimRef = useRef("");
  const speak = useRef<SpeakHandle | null>(null);
  const quiet = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSendRef = useRef(onSend);
  const onSpeakRef = useRef(onSpeak);
  const quietMsRef = useRef(quietMs);
  const mounted = useRef(true);

  useEffect(() => { onSendRef.current = onSend; });
  useEffect(() => { onSpeakRef.current = onSpeak; });
  useEffect(() => { quietMsRef.current = quietMs; });

  const clearQuiet = useCallback(() => {
    if (quiet.current) { clearTimeout(quiet.current); quiet.current = null; }
  }, []);

  const stopEverything = useCallback(() => {
    active.current = false;
    clearQuiet();
    speak.current?.cancel();
    speak.current = null;
    input.current?.stop();
    setPhase("idle");
    setInterim("");
  }, [clearQuiet]);

  const listen = useCallback(() => {
    if (!active.current || !mounted.current) return;
    setPhase("listening");
    setInterim("");
    finalRef.current = "";
    interimRef.current = "";
    clearQuiet();
    try {
      input.current?.start();
    } catch {
      setError("Unable to start the microphone. Check permissions or type the message.");
      stopEverything();
    }
  }, [clearQuiet, stopEverything]);

  const reply = useCallback(async (text: string) => {
    if (!active.current) return;
    setPhase("thinking");
    setError("");
    let result: SpeakableReply;
    try {
      result = await onSendRef.current(text);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : "Send failed. Restart the conversation to try again.");
      stopEverything();
      return;
    }
    if (!active.current) return;
    setPhase("speaking");
    await new Promise<void>((resolve) => {
      speak.current = onSpeakRef.current(
        result,
        () => { speak.current = null; resolve(); },
        (message) => { speak.current = null; setError(message); resolve(); },
      );
    });
    if (active.current) {
      // Give the microphone a moment after the reply so it does not pick it up.
      setTimeout(() => { if (active.current) listen(); }, 900);
    } else {
      setPhase("idle");
    }
  }, [listen, stopEverything]);

  useEffect(() => {
    mounted.current = true;
    const speech = new BrowserVoiceInput(window as unknown as RecognitionWindow, {
      onText(finalText, interimText) {
        finalRef.current = finalText;
        interimRef.current = interimText;
        setInterim(interimText);
        // The browser keeps the recognition open during pauses, so end-of-sentence
        // is detected here: no new recognized words for `quietMs` means the phrase
        // is complete, and the current turn is closed for processing.
        clearQuiet();
        quiet.current = setTimeout(() => {
          quiet.current = null;
          if (active.current) input.current?.stop();
        }, quietMsRef.current);
      },
      onEnd() {
        clearQuiet();
        setInterim("");
        if (!active.current) { setPhase("idle"); return; }
        // Include the last interim words: browsers do not always flush them as
        // final when stop() is called, so they would otherwise be lost.
        const text = [finalRef.current, interimRef.current].filter(Boolean).join(" ").trim();
        finalRef.current = "";
        interimRef.current = "";
        if (text) {
          void reply(text);
        } else {
          setTimeout(() => { if (active.current) listen(); }, 800);
        }
      },
      onError(message, code) {
        clearQuiet();
        if (!active.current) return;
        if (code === "no-speech") {
          setError("");
          setTimeout(() => { if (active.current) listen(); }, 800);
          return;
        }
        setError(message);
        stopEverything();
      },
    });
    input.current = speech;
    queueMicrotask(() => { if (mounted.current) setSupported(speech.supported); });
    return () => {
      mounted.current = false;
      stopEverything();
      speech.dispose();
      input.current = null;
    };
  }, [clearQuiet, listen, reply, stopEverything]);

  useEffect(() => {
    if (disabled && active.current) stopEverything();
  }, [disabled, stopEverything]);

  function toggle() {
    if (active.current) { stopEverything(); return; }
    if (!input.current?.supported) {
      setError("Voice recognition is not available in this browser; you can type the message.");
      return;
    }
    setError("");
    active.current = true;
    listen();
  }

  const running = phase !== "idle";
  return <section aria-label="Continuous voice conversation">
    <p>The assistant listens, detects when you have finished the sentence and replies, then listens again.</p>
    <button type="button" onClick={toggle} disabled={disabled || !supported}>
      {running ? "End conversation" : "Start conversation"}
    </button>
    {phase === "listening" && <p role="status" aria-live="polite">Listening…{interim ? ` ${interim}` : ""}</p>}
    {phase === "thinking" && <p role="status">Processing…</p>}
    {phase === "speaking" && <p role="status">Playing reply…</p>}
    {!supported && <p>Voice recognition is not available in this browser; you can type the message.</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
