"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { REACTION_DURATION_MS, summarizeReaction, type ReactionResult } from "@/client/reaction-test/contract";
import { ReactionEngine } from "@/client/reaction-test/engine";
import styles from "./reaction-test.module.css";

type Props = { onComplete?: (result: ReactionResult) => void };
export function ReactionTest({ onComplete }: Props) {
  const engine = useRef<ReactionEngine | null>(null);
  const [phase, setPhase] = useState<"ready" | "waiting" | "stimulus" | "finished">("ready");
  const [remaining, setRemaining] = useState(REACTION_DURATION_MS);
  const [result, setResult] = useState<ReactionResult | null>(null);
  const done = useCallback((value: ReactionResult) => {
    if (!engine.current) return;
    engine.current = null; setResult(value); setPhase("finished"); onComplete?.(value);
  }, [onComplete]);
  const active = phase === "waiting" || phase === "stimulus";
  useLayoutEffect(() => { if (phase === "stimulus") engine.current?.markDisplayed(); }, [phase]);
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      const update = engine.current?.tick();
      if (!update) return;
      if (update.result) done(update.result);
      else { setPhase(update.phase === "stimulus" ? "stimulus" : "waiting"); setRemaining(update.remainingMs); }
    }, 25);
    const visibility = () => { if (document.hidden && engine.current) done(engine.current.finish("hidden")); };
    const keydown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat || !engine.current) return;
      event.preventDefault();
      const update = engine.current.respond();
      if (update.result) done(update.result);
      else { setPhase(update.phase === "stimulus" ? "stimulus" : "waiting"); setRemaining(update.remainingMs); }
    };
    document.addEventListener("visibilitychange", visibility); window.addEventListener("keydown", keydown);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("keydown", keydown); };
  }, [active, done]);
  function start() {
    if (document.hidden) return;
    engine.current = new ReactionEngine(); setResult(null); setRemaining(REACTION_DURATION_MS); setPhase("waiting");
  }
  function respond() {
    const update = engine.current?.respond();
    if (!update) return;
    if (update.result) done(update.result);
    else { setPhase(update.phase === "stimulus" ? "stimulus" : "waiting"); setRemaining(update.remainingMs); }
  }
  const summary = result ? summarizeReaction(result.trials) : null;
  return <section className={styles.panel} aria-labelledby="reaction-title">
    <p className={styles.eyebrow}>ONBOARD / VIGILANCE DEMO</p>
    <h1 id="reaction-title">Reaction time test</h1>
    {phase === "ready" && <><p>When the circle lights up, press the space bar or tap the response button as quickly as you can. Wait for each light before responding.</p>
      <p>The test lasts 3 minutes. Keep this page visible until it ends.</p>
      <button className={styles.primary} type="button" onClick={start}>Start test</button></>}
    {active && <><div className={styles.topline}><span>Time remaining</span><strong>{Math.ceil(remaining / 1000)} s</strong></div>
      <div className={`${styles.signal} ${phase === "stimulus" ? styles.signalActive : ""}`} aria-hidden="true" />
      <p className={styles.signalText} aria-live="off">{phase === "stimulus" ? "RESPOND NOW" : "Wait for the light"}</p>
      <button className={styles.primary} type="button" onClick={respond}>Respond</button>
      <button className={styles.secondary} type="button" onClick={() => { if (engine.current) done(engine.current.finish("user")); }}>Stop test</button></>}
    {phase === "finished" && result && summary && <><h2>{result.status === "completed" ? "Test complete" : "Test interrupted"}</h2>
      {result.status === "interrupted" && <p>The session ended before completion ({result.interruption?.replaceAll("_", " ")}). Start again for a complete result.</p>}
      <dl className={styles.results}><div><dt>Median response</dt><dd>{summary.median_rt_ms === null ? "—" : `${Math.round(summary.median_rt_ms)} ms`}</dd></div>
        <div><dt>Responses</dt><dd>{summary.response_count}</dd></div><div><dt>Responses ≥ 500 ms</dt><dd>{summary.lapse_count}</dd></div>
        <div><dt>Early responses</dt><dd>{summary.false_start_count}</dd></div><div><dt>Missed signals</dt><dd>{summary.missed_count}</dd></div></dl>
      <p>Results are temporary and remain in this page until it is closed or restarted.</p><button className={styles.primary} type="button" onClick={start}>Start again</button></>}
    <p className={styles.note}>Experimental demonstration inspired by PVT, not a validated NASA test or diagnosis. The 500 ms display threshold is a demo convention.</p>
  </section>;
}
