"use client";

import { useEffect, useRef, useState } from "react";
import { SlothMascot } from "../../components/agent-avatar/SlothMascot";
import { VoiceComposer } from "../../components/agent-voice/VoiceComposer";
import { VoiceConversation, type SpeakableReply } from "../../components/agent-voice/VoiceConversation";
import { speakServerReply } from "../../client/voice/server-speech";
import { CreateSessionResponseSchema, MessageResponseSchema } from "../../server/agent/contracts";
import styles from "./sloth-demo.module.css";

type Message = { id: string; role: "ASTRONAUT" | "ASSISTANT"; text: string };
type Pending = { id: string; text: string; mode: "TEXT" | "VOICE" };

export function SlothDemo() {
  const [token, setToken] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [speaking, setSpeaking] = useState(false);
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
      if (result.status === 401) throw new Error("Token not recognized. Check the astronaut demo token.");
      if (result.status === 429) throw new Error("Service limit reached. Try again later.");
      if (result.status === 409) throw new Error("The conversation has changed. Reload and start a new session.");
      throw new Error("Service unavailable. Check the server and try again.");
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
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : "Unable to start the session."); }
    finally { startingRef.current = false; if (mounted.current) setStarting(false); }
  }

  async function send(text: string, mode: "TEXT" | "VOICE"): Promise<SpeakableReply> {
    if (!sessionId) throw new Error("Start a session first.");
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

  function speakReply(reply: SpeakableReply, onEnd: () => void, onError: (message: string) => void) {
    setSpeaking(true);
    return speakServerReply(
      { sessionId, messageId: reply.messageId, text: reply.text, token: token.trim() },
      () => { setSpeaking(false); onEnd(); },
      (message) => { setSpeaking(false); onError(message); },
    );
  }

  const manualSend = (text: string, mode: "TEXT" | "VOICE") => send(text, mode).then((reply) => {
    speakReply(reply, () => undefined, (message) => setError(message));
  });

  const lastReply = [...messages].reverse().find((item) => item.role === "ASSISTANT");

  return <main className={styles.page} lang="en">
    <div className={styles.shell}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Assistente di bordo · Demo interattiva</p>
        <h1>Parla con l’assistente</h1>
      </header>
      {!sessionId ? <form className={styles.panel} onSubmit={start}>
        <label htmlFor="demo-token">Astronaut demo token</label>
        <p>Enter the value of <code>AGENT_DEMO_TOKEN</code> from your local file <code>.env</code>. This is separate from your NVIDIA key.</p>
        <input id="demo-token" type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} />
        <button type="submit" disabled={starting || !token.trim()}>{starting ? "Starting…" : "Start session"}</button>
        {error && <p role="alert">{error}</p>}
      </form> : <>
        <div className={styles.stage}>
          <SlothMascot speaking={speaking} />
          {lastReply && <p className={styles.bubble}>{lastReply.text}</p>}
        </div>
        <div className={styles.panel}><VoiceConversation onSend={(text) => send(text, "VOICE")} onSpeak={speakReply} /></div>
        <div className={styles.panel}><VoiceComposer onSend={manualSend} /></div>
        <section className={styles.panel} aria-labelledby="history-title">
          <h2 id="history-title">Cronologia</h2>
          {!messages.length && <p>Your session is ready. Start voice conversation or type your first message.</p>}
          <ol className={styles.log} aria-live="polite">
            {messages.map((item) => <li key={item.id}><strong>{item.role === "ASTRONAUT" ? "You" : "Assistant"}</strong><p>{item.text}</p></li>)}
          </ol>
        </section>
        <p className={styles.footnote}>The assistant speaks aloud and its avatar animates while speaking. You can dictate or type freely. The check-in stays a private draft until you choose to share it.</p>
        <p className={styles.footnote}>Voice: <a href="https://elevenlabs.io" target="_blank" rel="noreferrer">powered by ElevenLabs</a> (with browser fallback).</p>
      </>}
    </div>
  </main>;
}
