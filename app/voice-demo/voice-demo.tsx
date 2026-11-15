"use client";

import { useEffect, useRef, useState } from "react";
import { VoiceComposer } from "../../components/agent-voice/VoiceComposer";
import { VoiceConversation, type SpeakableReply } from "../../components/agent-voice/VoiceConversation";
import { VoicePlayback } from "../../components/agent-voice/VoicePlayback";
import { speakServerReply } from "../../client/voice/server-speech";
import { CreateSessionResponseSchema, MessageResponseSchema, type CheckIn } from "../../server/agent/contracts";
import { VisionPanel } from "./vision-panel";
import styles from "./voice-demo.module.css";

type Message = { id: string; role: "ASTRONAUT" | "ASSISTANT"; text: string };
type Pending = { id: string; text: string; mode: "TEXT" | "VOICE" };

export function VoiceDemo() {
  const [token, setToken] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [checkIn, setCheckIn] = useState<CheckIn | null>(null);
  const [panelBusy, setPanelBusy] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [confirmationPending, setConfirmationPending] = useState(false);
  const pending = useRef<Pending | null>(null);
  const mounted = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const startingRef = useRef(false);
  const operation = useRef(false);

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
      if (result.status === 401) throw new Error("Token not recognized. Check the astronaut demo token.");
      if (result.status === 429) throw new Error("Service limit reached. Try again later.");
      if (result.status === 409) throw new Error("The conversation has changed. Reload the page and start a new session.");
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
    if (operation.current || confirmationPending || checkIn?.status === "CONFIRMED") throw new Error("Wait for the in-progress operation to finish.");
    operation.current = true; setChatBusy(true);
    try {
      const previous = pending.current;
      if (!previous || previous.text !== text || previous.mode !== mode) pending.current = { id: crypto.randomUUID(), text, mode };
      const current = pending.current!;
      let payload: unknown;
      try {
        payload = await request(`/sessions/${sessionId}/messages`, { clientMessageId: current.id, text: current.text, inputMode: current.mode });
      } catch (e) {
        if (e instanceof TypeError) throw new Error("Connection interrupted. You can retry the same message.");
        throw e;
      }
      const result = MessageResponseSchema.parse(payload).data;
      pending.current = null;
      if (mounted.current) { setMessages((items) => [...items, result.astronautMessage, result.assistantMessage]); setCheckIn(result.checkIn); }
      return { text: result.assistantMessage.text, messageId: result.assistantMessage.id };
    } finally { operation.current = false; if (mounted.current) setChatBusy(false); }
  }

  async function runPanel<T>(task: () => Promise<T>): Promise<T> {
    if (operation.current) throw new Error("Wait for the in-progress operation to finish.");
    operation.current = true; setPanelBusy(true);
    try { return await task(); }
    finally { operation.current = false; if (mounted.current) setPanelBusy(false); }
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
  return <main className={styles.page} lang="en">
    <div className={styles.shell}>
      <header><p className={styles.eyebrow}>Local demo · Onboard assistant</p><h1>Talk to the assistant</h1>
        <p>Start a session, dictate or type a message and listen to the reply.</p></header>
      {!sessionId ? <form className={styles.panel} onSubmit={start}>
        <label htmlFor="demo-token">Astronaut demo token</label>
        <p>Enter the value of <code>AGENT_DEMO_TOKEN</code> from the local <code>.env</code> file. It is not the NVIDIA key.</p>
        <input id="demo-token" type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} />
        <button type="submit" disabled={starting || !token.trim()}>{starting ? "Starting…" : "Start session"}</button>
        {error && <p role="alert">{error}</p>}
      </form> : <>
        <section className={styles.panel} aria-labelledby="conversation-title">
          <h2 id="conversation-title">Conversation</h2>
          {!messages.length && <p>The session is ready. Start the continuous conversation or type the first message.</p>}
          <ol className={styles.messages} aria-live="polite">
            {messages.map((item) => <li key={item.id}><strong>{item.role === "ASTRONAUT" ? "You" : "Assistant"}</strong><p>{item.text}</p></li>)}
          </ol>
          {lastReply && <VoicePlayback text={lastReply.text} />}
        </section>
        <VisionPanel token={token} sessionId={sessionId} checkIn={checkIn} busy={panelBusy || chatBusy} locked={confirmationPending}
          run={runPanel} onCheckIn={setCheckIn} onConfirmationPending={setConfirmationPending} />
        <div className={styles.panel}><VoiceConversation disabled={panelBusy || confirmationPending || checkIn?.status === "CONFIRMED"} onSend={(text) => send(text, "VOICE")} onSpeak={speakReply} /></div>
        <div className={styles.panel}><VoiceComposer disabled={panelBusy || confirmationPending || checkIn?.status === "CONFIRMED"} onSend={manualSend} /></div>
        <p className={styles.footnote}>In continuous mode the reply is read aloud and the assistant listens again on its own. You can always interrupt and use manual mode to correct the text. Sharing happens only when the check-in is confirmed.</p>
        <p className={styles.footnote}>Voice: <a href="https://elevenlabs.io" target="_blank" rel="noreferrer">powered by ElevenLabs</a> (with browser fallback).</p>
      </>}
    </div>
  </main>;
}
