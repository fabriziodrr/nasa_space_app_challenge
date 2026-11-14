"use client";

import { useEffect, useRef, useState } from "react";
import { VoiceComposer } from "../../components/agent-voice/VoiceComposer";
import { VoiceConversation, type SpeakableReply } from "../../components/agent-voice/VoiceConversation";
import { VoicePlayback } from "../../components/agent-voice/VoicePlayback";
import { speakServerReply } from "../../client/voice/server-speech";
import { CreateSessionResponseSchema, MessageResponseSchema } from "../../server/agent/contracts";
import styles from "./voice-demo.module.css";

type Message = { id: string; role: "ASTRONAUT" | "ASSISTANT"; text: string };
type Pending = { id: string; text: string; mode: "TEXT" | "VOICE" };

export function VoiceDemo() {
  const [token, setToken] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<Pending | null>(null);
  const mounted = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const startingRef = useRef(false);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);

  async function request(path: string, body: object) {
    controller.current = new AbortController();
    const result = await fetch(`/api/agent/v1${path}`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token.trim()}` },
      body: JSON.stringify(body), signal: controller.current.signal, cache: "no-store",
    });
    const payload: unknown = await result.json();
    if (!result.ok) {
      // Render a controlled message: never display upstream/provider bodies.
      if (result.status === 401) throw new Error("Token non riconosciuto. Controlla il token demo dell'astronauta.");
      if (result.status === 429) throw new Error("Limite del servizio raggiunto. Riprova più tardi.");
      if (result.status === 409) throw new Error("La conversazione è cambiata. Ricarica la pagina e apri una nuova sessione.");
      throw new Error("Servizio non disponibile. Controlla il server e riprova.");
    }
    return payload;
  }

  async function start(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (startingRef.current || !token.trim()) return;
    startingRef.current = true; setStarting(true); setError("");
    try {
      const parsed = CreateSessionResponseSchema.parse(await request("/sessions", { astronautId: "astro-1" }));
      if (mounted.current) setSessionId(parsed.data.id);
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : "Impossibile avviare la sessione."); }
    finally { startingRef.current = false; if (mounted.current) setStarting(false); }
  }

  async function send(text: string, mode: "TEXT" | "VOICE"): Promise<SpeakableReply> {
    if (!sessionId) throw new Error("Avvia prima la sessione.");
    const previous = pending.current;
    if (!previous || previous.text !== text || previous.mode !== mode) pending.current = { id: crypto.randomUUID(), text, mode };
    const current = pending.current!;
    let payload: unknown;
    try {
      payload = await request(`/sessions/${sessionId}/messages`, { clientMessageId: current.id, text: current.text, inputMode: current.mode });
    } catch (e) {
      if (e instanceof TypeError) throw new Error("Connessione interrotta. Puoi riprovare lo stesso messaggio.");
      throw e;
    }
    const result = MessageResponseSchema.parse(payload).data;
    pending.current = null;
    if (mounted.current) setMessages((items) => [...items, result.astronautMessage, result.assistantMessage]);
    return { text: result.assistantMessage.text, messageId: result.assistantMessage.id };
  }

  const manualSend = (text: string, mode: "TEXT" | "VOICE") => send(text, mode).then(() => undefined);

  function speakReply(reply: SpeakableReply, onEnd: () => void, onError: (message: string) => void) {
    return speakServerReply(
      { sessionId, messageId: reply.messageId, text: reply.text, token: token.trim() },
      onEnd,
      onError,
    );
  }

  const lastReply = [...messages].reverse().find((item) => item.role === "ASSISTANT");
  return <main className={styles.page} lang="it">
    <div className={styles.shell}>
      <header><p className={styles.eyebrow}>Prova locale · Assistente di bordo</p><h1>Parla con l’assistente</h1>
        <p>Avvia una sessione, detta o scrivi un messaggio e ascolta la risposta.</p></header>
      {!sessionId ? <form className={styles.panel} onSubmit={start}>
        <label htmlFor="demo-token">Token demo astronauta</label>
        <p>Inserisci il valore di <code>AGENT_DEMO_TOKEN</code> dal file locale <code>.env</code>. Non è la chiave NVIDIA.</p>
        <input id="demo-token" type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} />
        <button type="submit" disabled={starting || !token.trim()}>{starting ? "Avvio…" : "Avvia sessione"}</button>
        {error && <p role="alert">{error}</p>}
      </form> : <>
        <section className={styles.panel} aria-labelledby="conversation-title">
          <h2 id="conversation-title">Conversazione</h2>
          {!messages.length && <p>La sessione è pronta. Avvia la conversazione continua oppure scrivi il primo messaggio.</p>}
          <ol className={styles.messages} aria-live="polite">
            {messages.map((item) => <li key={item.id}><strong>{item.role === "ASTRONAUT" ? "Tu" : "Assistente"}</strong><p>{item.text}</p></li>)}
          </ol>
          {lastReply && <VoicePlayback text={lastReply.text} />}
        </section>
        <div className={styles.panel}><VoiceConversation onSend={(text) => send(text, "VOICE")} onSpeak={speakReply} /></div>
        <div className={styles.panel}><VoiceComposer onSend={manualSend} /></div>
        <p className={styles.footnote}>In modalità continua la risposta viene letta ad alta voce e l’assistente torna in ascolto da solo. Puoi sempre interrompere e usare la modalità manuale per correggere il testo. Il check-in rimane una bozza e non viene condiviso automaticamente.</p>
        <p className={styles.footnote}>Voce: <a href="https://elevenlabs.io" target="_blank" rel="noreferrer">powered by ElevenLabs</a> (con browser di riserva).</p>
      </>}
    </div>
  </main>;
}
