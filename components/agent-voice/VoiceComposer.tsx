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
          setError("Il messaggio supera 8000 caratteri: riducilo prima di inviarlo.");
          speech.stop();
        }
        setInterim(interimText);
        if (finalText) setVoiceUsed(true);
      },
      onEnd(hadTextOrError) {
        setListening(false);
        setInterim("");
        if (!hadTextOrError) setError("Non ho rilevato parole. Riprova oppure scrivi il messaggio.");
      },
      onError(message) { setError(message); },
    });
    input.current = speech;
    // Browser support is established only after hydration.
    queueMicrotask(() => { if (mounted.current) setSupported(speech.supported); });
    return () => { mounted.current = false; speech.dispose(); input.current = null; };
  }, []);

  async function send() {
    const trimmed = text.trim();
    if (running.current || disabled || listening || !trimmed || trimmed.length > 8000) return;
    running.current = true;
    setBusy(true); setError("");
    try {
      await onSend(trimmed, voiceUsed ? "VOICE" : "TEXT");
      if (mounted.current) { setText(""); setVoiceUsed(false); }
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : "Invio non riuscito. Riprova.");
    } finally { running.current = false; if (mounted.current) setBusy(false); }
  }

  function start() {
    if (disabled || busy || listening) return;
    setError(""); setInterim("");
    base.current = text.trim();
    window.speechSynthesis?.cancel();
    try { input.current?.start(); setListening(true); }
    catch { setError("Impossibile avviare il microfono. Verifica i permessi o scrivi il messaggio."); }
  }

  return <section aria-label="Scrivi o detta un messaggio">
    <p>Puoi dettare in italiano e correggere il testo prima di inviarlo. Il riconoscimento dipende dal browser e può usare un servizio online.</p>
    <label htmlFor="agent-message">Messaggio</label>
    <textarea id="agent-message" rows={4} maxLength={8000} value={text} disabled={disabled || listening || busy}
      onChange={(event) => { setText(event.target.value); if (!event.target.value) setVoiceUsed(false); }} placeholder="Scrivi oppure usa il microfono" />
    {interim && <p aria-live="polite">Sto ascoltando: {interim}</p>}
    <div className="voice-actions">
      {!listening ? <button type="button" onClick={start} disabled={disabled || busy || !supported}>Avvia microfono</button>
        : <button type="button" onClick={() => input.current?.stop()}>Termina dettatura</button>}
      <button type="button" onClick={send} disabled={disabled || listening || busy || !text.trim() || text.trim().length > 8000}>{busy ? "Invio…" : "Invia messaggio"}</button>
    </div>
    {!supported && <p>Riconoscimento vocale non disponibile in questo browser; puoi scrivere il messaggio.</p>}
    {listening && <p role="status">Microfono attivo. La dettatura termina al massimo dopo due minuti.</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
