"use client";

import { useEffect, useRef, useState } from "react";
import { SlothMascot } from "../../components/agent-avatar/SlothMascot";
import { PsychologicalProfile } from "../../components/agent-avatar/PsychologicalProfile";
import { BrowserVoiceInput, type RecognitionWindow } from "../../client/voice/recognition";
import { speakServerReply } from "../../client/voice/server-speech";
import { selectDemoProfile } from "../../client/demo-session";
import { CreateSessionResponseSchema, MessageResponseSchema, type CheckIn } from "../../server/agent/contracts";
import { FAKE_DAYS, buildProfile, type FakeDay } from "./fake-history";
import styles from "./sloth-demo.module.css";

type Message = { id: string; role: "ASTRONAUT" | "ASSISTANT"; text: string };
type Pending = { id: string; text: string; mode: "TEXT" | "VOICE" };

const SILENCE_MS = 2000;
const START_GRACE_MS = 6000;

export function SlothDemo() {
  const token = "";
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [checkIn, setCheckIn] = useState<CheckIn | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [starting, setStarting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [showProfile, setShowProfile] = useState(true);
  const [error, setError] = useState("");
  const pending = useRef<Pending | null>(null);
  const mounted = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const startingRef = useRef(false);
  const speech = useRef<BrowserVoiceInput | null>(null);
  const base = useRef("");
  const chatRef = useRef<HTMLDivElement | null>(null);
  const quiet = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heard = useRef("");
  const captured = useRef(false);
  const autoProcess = useRef(false);
  const processRef = useRef<(text: string) => void>(() => {});

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);

  useEffect(() => {
    const clearQuiet = () => {
      if (quiet.current) { clearTimeout(quiet.current); quiet.current = null; }
    };
    const input = new BrowserVoiceInput(window as unknown as RecognitionWindow, {
      onText(finalText, interimText) {
        const combined = [base.current, finalText].filter(Boolean).join(" ").trim();
        heard.current = [combined, interimText].filter(Boolean).join(" ").trim();
        if (finalText || interimText) captured.current = true;
        setDraft(combined);
        setInterim(interimText);
        // End of speech is detected here: after a stable pause, stop the
        // microphone so the turn can be processed instead of listening forever.
        clearQuiet();
        quiet.current = setTimeout(() => {
          quiet.current = null;
          if (captured.current) speech.current?.stop();
        }, SILENCE_MS);
      },
      onEnd() {
        clearQuiet();
        setListening(false);
        setInterim("");
        if (autoProcess.current) {
          autoProcess.current = false;
          const text = heard.current.trim();
          if (captured.current && text) processRef.current(text);
          else if (!captured.current) setError("No words detected. Try again or type the message.");
        }
        captured.current = false;
      },
      onError(message) {
        clearQuiet();
        autoProcess.current = false;
        captured.current = false;
        setListening(false); setInterim(""); setError(message);
      },
    });
    speech.current = input;
    return () => { clearQuiet(); input.dispose(); speech.current = null; };
  }, []);

  useEffect(() => { chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight }); }, [messages, speaking]);

  async function request(path: string, body: object) {
    controller.current = new AbortController();
    const result = await fetch(`/api/agent/v1${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: controller.current.signal, cache: "no-store",
    });
    const payload: unknown = await result.json();
    if (!result.ok) {
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
      await selectDemoProfile("astro-1");
      const parsed = CreateSessionResponseSchema.parse(await request("/sessions", { astronautId: "astro-1" }));
      if (mounted.current) setSessionId(parsed.data.id);
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : "Unable to start the session."); }
    finally { startingRef.current = false; if (mounted.current) setStarting(false); }
  }

  async function send(text: string, mode: "TEXT" | "VOICE"): Promise<{ text: string; messageId: string }> {
    if (!sessionId) throw new Error("Start a session first.");
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
  }

  function speakReply(reply: { text: string; messageId: string }, onEnd: () => void, onError: (message: string) => void) {
    setSpeaking(true);
    return speakServerReply(
      { sessionId, messageId: reply.messageId, text: reply.text, token: token.trim() },
      () => { setSpeaking(false); onEnd(); },
      (message) => { setSpeaking(false); onError(message); },
    );
  }

  async function run(text: string, mode: "TEXT" | "VOICE") {
    if (!text || busy) return;
    setDraft(""); setBusy(true); setError("");
    try {
      const reply = await send(text, mode);
      speakReply(reply, () => undefined, (message) => setError(message));
    } catch (e) { setError(e instanceof Error ? e.message : "Send failed."); }
    finally { if (mounted.current) setBusy(false); }
  }

  async function submit() {
    if (listening) return;
    await run(draft.trim(), "TEXT");
  }

  processRef.current = (text) => { void run(text, "VOICE"); };

  function toggleMic() {
    if (quiet.current) { clearTimeout(quiet.current); quiet.current = null; }
    if (listening) {
      autoProcess.current = false;
      speech.current?.stop();
      return;
    }
    base.current = draft.trim();
    heard.current = base.current;
    captured.current = false;
    autoProcess.current = true;
    setError("");
    try {
      speech.current?.start();
      setListening(true);
      // Safety net: stop listening even if nothing is recognized at all.
      quiet.current = setTimeout(() => {
        quiet.current = null;
        speech.current?.stop();
      }, START_GRACE_MS);
    } catch {
      autoProcess.current = false;
      setError("Unable to start the microphone. Check permissions.");
    }
  }

  const num = (field: string) => { const o = checkIn?.observations.find((x) => x.field === field); return typeof o?.value === "number" ? o.value : 0; };
  const str = (field: string) => { const o = checkIn?.observations.find((x) => x.field === field); return typeof o?.value === "string" ? o.value : ""; };
  const today: FakeDay | null = checkIn ? {
    id: "today", title: "Today", sleepHours: num("SLEEP_HOURS"), sleepQuality: num("SLEEP_QUALITY"),
    fatigue: num("FATIGUE"), presence: checkIn.observations.length ? 6 : 0, mentalNote: str("MENTAL_STATE"), stressor: str("STRESSOR_NOTES"),
  } : null;
  const days = [...FAKE_DAYS, ...(today ? [today] : [])];
  const profile = buildProfile(days);

  return <main className={styles.page} lang="en">
    {!sessionId ? <form className={styles.startPanel} onSubmit={start}>
      <div className={styles.startInner}>
        <SlothMascot speaking={false} />
        <h1>Onboard assistant</h1>
        <p>Start a check-in with the onboard assistant.</p>
        <button type="submit" disabled={starting}>{starting ? "Starting…" : "Start session"}</button>
        {error && <p className={styles.errorText}>{error}</p>}
      </div>
    </form> : <div className={styles.app}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>SLOTH<span>· assistant</span></div>
        <button className={styles.newChat} type="button" onClick={() => window.location.reload()}>+ New check-in</button>
        <div className={styles.sectionLabel}>History</div>
        <ul className={styles.historyList}>
          {[...FAKE_DAYS].reverse().map((day) => <li key={day.id} className={styles.historyItem}>{day.title}</li>)}
          <li className={`${styles.historyItem} ${styles.historyActive}`}>Today · Check-in</li>
        </ul>
        <button className={`${styles.profileToggle} ${showProfile ? styles.profileToggleOn : ""}`} type="button" onClick={() => setShowProfile((v) => !v)}>
          Psychological profile
        </button>
      </aside>

      <section className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.avatar}><SlothMascot speaking={speaking} size={44} showWaves={false} /></div>
          <div>
            <div className={styles.topTitle}>Onboard assistant</div>
            <div className={styles.topStatus}>{speaking ? "Speaking…" : busy ? "Processing…" : "Online"}</div>
          </div>
        </header>

        <div className={styles.chat} ref={chatRef}>
          {!messages.length && <div className={styles.empty}>
            <p>Good morning, I’m your onboard assistant.</p>
            <p>Answer the check-in questions: I’ll guide you through them, one at a time.</p>
          </div>}
          {messages.map((item) => (
            <div key={item.id} className={`${styles.row} ${item.role === "ASTRONAUT" ? styles.rowUser : styles.rowAssistant}`}>
              <div className={styles.bubble}>{item.text}</div>
            </div>
          ))}
          {error && <p className={styles.errorText}>{error}</p>}
        </div>

        <footer className={styles.inputBar}>
          <button className={`${styles.micButton} ${listening ? styles.micOn : ""}`} type="button" onClick={toggleMic} disabled={busy} aria-label="Microphone">
            {listening ? "■" : "🎙"}
          </button>
          <input className={styles.input} value={draft} placeholder={listening ? "Listening…" : "Type a message"} disabled={listening}
            onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); } }} />
          <button className={styles.sendButton} type="button" onClick={() => void submit()} disabled={busy || listening || !draft.trim()}>Send</button>
        </footer>
        {interim && <div className={styles.interim}>Listening: {interim}</div>}
      </section>

      {showProfile && <aside className={styles.profilePanel}>
        <div className={styles.profileHeader}>
          <span>Profile</span>
          <button type="button" onClick={() => setShowProfile(false)} aria-label="Close">×</button>
        </div>
        <PsychologicalProfile profile={profile} />
      </aside>}
    </div>}
  </main>;
}
