"use client";

import { useEffect, useRef, useState } from "react";
import { VoiceComposer } from "../../components/agent-voice/VoiceComposer";
import { VoiceConversation, type SpeakableReply } from "../../components/agent-voice/VoiceConversation";
import { SlothMascot } from "../../components/agent-avatar/SlothMascot";
import { speakServerReply } from "../../client/voice/server-speech";
import { selectDemoProfile } from "../../client/demo-session";
import type { SpeakHandle } from "../../client/voice/speech";
import { CreateSessionResponseSchema, MessageResponseSchema, type CheckIn } from "../../server/agent/contracts";
import { VisionPanel } from "./vision-panel";
import { demoCrewMappings } from "../../server/agent/demo-crew";
import styles from "./voice-demo.module.css";

type Message = { id: string; role: "ASTRONAUT" | "ASSISTANT"; text: string };
type Pending = { id: string; text: string; mode: "TEXT" | "VOICE" };

export function VoiceDemo({ embedded = false }: { embedded?: boolean }) {
  const token = "";
  const [astronautId, setAstronautId] = useState("astro-1");
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [checkIn, setCheckIn] = useState<CheckIn | null>(null);
  const [panelBusy, setPanelBusy] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [confirmationPending, setConfirmationPending] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [speechError, setSpeechError] = useState("");
  const pending = useRef<Pending | null>(null);
  const mounted = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const startingRef = useRef(false);
  const operation = useRef(false);
  const playback = useRef<SpeakHandle | null>(null);
  const playbackEnd = useRef<(() => void) | null>(null);
  const playbackGeneration = useRef(0);

  useEffect(() => {
    mounted.current = true;
    const generation = playbackGeneration;
    return () => {
      mounted.current = false; controller.current?.abort(); generation.current++; playback.current?.cancel();
    };
  }, []);

  async function request(path: string, body: object) {
    controller.current = new AbortController();
    const result = await fetch(`/api/agent/v1${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: controller.current.signal, cache: "no-store",
    });
    const payload: unknown = await result.json();
    if (!result.ok) {
      // Render a controlled message: never display upstream/provider bodies.
      if (result.status === 401) throw new Error("Demo session unavailable. Start a new session.");
      if (result.status === 429) throw new Error("Service limit reached. Try again later.");
      if (result.status === 409) throw new Error("The conversation has changed. Reload the page and start a new session.");
      throw new Error("Service unavailable. Check the server and try again.");
    }
    return payload;
  }

  async function start(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (startingRef.current) return;
    startingRef.current = true; setStarting(true); setError("");
    try {
      await selectDemoProfile(astronautId);
      const parsed = CreateSessionResponseSchema.parse(await request("/sessions", { astronautId }));
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

  const manualSend = (text: string, mode: "TEXT" | "VOICE") => send(text, mode).then((reply) => {
    speakReply(reply, () => {}, (message) => setSpeechError(message));
  });

  function stopPlayback() {
    playbackGeneration.current++;
    playback.current?.cancel();
    playback.current = null;
    const finish = playbackEnd.current;
    playbackEnd.current = null;
    if (mounted.current) setSpeaking(false);
    finish?.();
  }

  function speakReply(reply: SpeakableReply, onEnd: () => void, onError: (message: string) => void) {
    stopPlayback();
    const generation = playbackGeneration.current;
    setSpeechError(""); setSpeaking(true);
    playbackEnd.current = onEnd;
    const handle = speakServerReply(
      { sessionId, messageId: reply.messageId, text: reply.text, token: token.trim() },
      () => {
        if (generation !== playbackGeneration.current) return;
        playback.current = null; playbackEnd.current = null; if (mounted.current) setSpeaking(false); onEnd();
      },
      (message) => {
        if (generation !== playbackGeneration.current) return;
        playback.current = null; playbackEnd.current = null; if (mounted.current) setSpeaking(false); onError(message);
      },
    );
    playback.current = handle;
    return { cancel() { if (generation === playbackGeneration.current) stopPlayback(); else handle.cancel(); } };
  }

  const lastReply = [...messages].reverse().find((item) => item.role === "ASSISTANT");
  return <section className={`${styles.page} ${embedded ? styles.embedded : ""}`} lang="en" aria-label="S.L.O.T.H. voice assistant">
    <div className={styles.shell}>
      <header><p className={styles.eyebrow}>Local demo · Onboard assistant</p><h1>Talk to the assistant</h1>
        <p>Start a session, dictate or type a message and listen to the reply.</p></header>
      {embedded && <div className={styles.stage}>
        <SlothMascot speaking={speaking} size={130} />
        {lastReply && <p className={styles.bubble}>{lastReply.text}</p>}
      </div>}
      {!sessionId ? <form className={styles.panel} onSubmit={start}>
        <label htmlFor="demo-astronaut">Astronaut profile</label>
        <select id="demo-astronaut" value={astronautId} onChange={(event) => setAstronautId(event.target.value)}>{demoCrewMappings.map((member) => <option value={member.astronautId} key={member.astronautId}>{member.name}</option>)}</select>
        <button type="submit" disabled={starting}>{starting ? "Starting…" : "Start session"}</button>
        {error && <p role="alert">{error}</p>}
      </form> : <>
        {!embedded && <div className={styles.stage}>
          <SlothMascot speaking={speaking} />
          {lastReply && <p className={styles.bubble}>{lastReply.text}</p>}
        </div>}
        {embedded && <div className={styles.panel}><VoiceConversation disabled={panelBusy || confirmationPending || checkIn?.status === "CONFIRMED"} onSend={(text) => send(text, "VOICE")} onSpeak={speakReply} /></div>}
        {embedded && <div className={styles.panel}><VoiceComposer disabled={panelBusy || speaking || confirmationPending || checkIn?.status === "CONFIRMED"} onSend={manualSend} /></div>}
        <section className={styles.panel} aria-labelledby="conversation-title">
          <h2 id="conversation-title">Conversation</h2>
          {!messages.length && <p>The session is ready. Start the continuous conversation or type the first message.</p>}
          <ol className={styles.messages} aria-live="polite">
            {messages.map((item) => <li key={item.id}><strong>{item.role === "ASTRONAUT" ? "You" : "Assistant"}</strong><p>{item.text}</p></li>)}
          </ol>
          {lastReply && <div>
            <button type="button" disabled={speaking} onClick={() => speakReply({ text: lastReply.text, messageId: lastReply.id }, () => {}, setSpeechError)}>Listen to reply</button>
            <button type="button" disabled={!speaking} onClick={stopPlayback}>Stop playback</button>
          </div>}
          {speechError && <p role="alert">{speechError}</p>}
        </section>
        {embedded ? <details open className={styles.visionDetails}><summary>Vision and check-in · review and share with Houston</summary><VisionPanel token={token} sessionId={sessionId} astronautId={astronautId} checkIn={checkIn} busy={panelBusy || chatBusy} locked={confirmationPending}
          run={runPanel} onCheckIn={setCheckIn} onConfirmationPending={setConfirmationPending} /></details> : <VisionPanel token={token} sessionId={sessionId} astronautId={astronautId} checkIn={checkIn} busy={panelBusy || chatBusy} locked={confirmationPending}
          run={runPanel} onCheckIn={setCheckIn} onConfirmationPending={setConfirmationPending} />}
        {!embedded && <div className={styles.panel}><VoiceConversation disabled={panelBusy || confirmationPending || checkIn?.status === "CONFIRMED"} onSend={(text) => send(text, "VOICE")} onSpeak={speakReply} /></div>}
        {!embedded && <div className={styles.panel}><VoiceComposer disabled={panelBusy || speaking || confirmationPending || checkIn?.status === "CONFIRMED"} onSend={manualSend} /></div>}
        <p className={styles.footnote}>In continuous mode the reply is read aloud and the assistant listens again on its own. You can always interrupt and use manual mode to correct the text. Sharing happens only when the check-in is confirmed.</p>
        <p className={styles.footnote}>Voice: <a href="https://elevenlabs.io" target="_blank" rel="noreferrer">powered by ElevenLabs</a> (with browser fallback).</p>
      </>}
    </div>
  </section>;
}
