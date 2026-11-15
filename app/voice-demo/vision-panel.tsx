"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { DemoApiError, confirmVision, selectVision, uploadVision } from "../../client/vision/demo-api";
import { parseVisionBridgeMessage, visionOrigin, VISION_BRIDGE_CHANNEL } from "../../client/vision/bridge";
import { SessionResponseSchema, type CheckIn, type VisionObservation } from "../../server/agent/contracts";
import styles from "./voice-demo.module.css";

type Confirmation = { expectedRevision: number; sharedObservationIds: string[]; vision: { visionObservationId: string | null; shareWithGround: boolean } };
type Props = { token: string; sessionId: string; astronautId: string; checkIn: CheckIn | null; busy: boolean; locked: boolean;
  run<T>(operation: () => Promise<T>): Promise<T>; onCheckIn(checkIn: CheckIn): void; onConfirmationPending(value: boolean): void };

const labels: Record<string, string> = { SLEEP_HOURS: "Sleep hours", SLEEP_QUALITY: "Sleep quality (1–10)",
  FATIGUE: "Fatigue (1–10)", PHYSICAL_NOTES: "Physical condition", MENTAL_STATE: "Mental state", STRESSOR_NOTES: "Stressors" };
const reasonLabels: Record<string, string> = { NO_VALID_TIME: "no valid time", TOO_SHORT: "measurement too short",
  LOW_COVERAGE: "insufficient coverage", STALE: "stale measurement", INTERRUPTED: "interrupted measurement",
  SYNTHETIC_TIME_UNAVAILABLE: "real time unavailable for the synthetic replay" };
const percent = (value: number | null) => value === null ? "unavailable" : `${(value * 100).toFixed(1)}%`;

export function VisionPanel({ token, sessionId, astronautId, checkIn, busy, locked, run, onCheckIn, onConfirmationPending }: Props) {
  const [observations, setObservations] = useState<VisionObservation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sharedVision, setSharedVision] = useState(false);
  const [sharedIds, setSharedIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selectionUncertain, setSelectionUncertain] = useState(false);
  const [showVision, setShowVision] = useState(false);
  const [generation, setGeneration] = useState<"NOT_STARTED" | "PROCESSING" | "READY" | "FAILED" | "UNAVAILABLE">("NOT_STARTED");
  const [noChangeReason, setNoChangeReason] = useState<string | null>(null);
  const [integrated, setIntegrated] = useState<{ sleepHours: number | null; visionStatus: string; visionSource: string | null; visionQuality: string | null } | null>(null);
  const iframe = useRef<HTMLIFrameElement>(null);
  const inFlight = useRef(new Set<string>());
  const pendingConfirmation = useRef<Confirmation | null>(null);
  const pendingSelection = useRef<{ id: string | null } | null>(null);
  const confirmed = checkIn?.status === "CONFIRMED";
  const selected = observations.find((item) => item.id === selectedId);
  const bridgeOrigin = (() => { try { return visionOrigin(process.env.NEXT_PUBLIC_VISION_ORIGIN); } catch { return null; } })();

  useEffect(() => {
    if (!confirmed) return;
    let stopped = false;
    async function refresh() {
      try {
        const response = await fetch(`/api/agent/v1/sessions/${encodeURIComponent(sessionId)}`, { cache: "no-store" });
        if (!response.ok) throw new Error();
        const state = SessionResponseSchema.parse(await response.json()).data;
        if (!stopped) { setGeneration(state.generationStatus); setNoChangeReason(state.noChangeReason); }
      } catch { if (!stopped) setGeneration("UNAVAILABLE"); }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => { stopped = true; clearInterval(timer); };
  }, [confirmed, sessionId, token]);

  async function retryGeneration() {
    if (!checkIn) return;
    await perform(async () => {
      const response = await fetch(`/api/agent/v2/check-ins/${encodeURIComponent(checkIn.id)}/generate`, {
        method: "POST", cache: "no-store",
      });
      if (!response.ok) throw new Error("Unable to restart generation. Try again.");
      setGeneration("PROCESSING");
    });
  }

  useEffect(() => {
    if (!bridgeOrigin) return;
    function receive(event: MessageEvent) {
      const frame = iframe.current?.contentWindow ?? null;
      const received = parseVisionBridgeMessage(event, bridgeOrigin!, frame);
      if (!received || !frame || inFlight.current.has(received.requestId)) return;
      const answer = (ok: boolean, message: string) => frame.postMessage({ channel: VISION_BRIDGE_CHANNEL,
        type: "IMPORT_RESULT", requestId: received.requestId, ok, message }, bridgeOrigin!);
      if (busy || locked || confirmed) { answer(false, "Complete the current operation before sending the measurement."); return; }
      inFlight.current.add(received.requestId); setError(""); setMessage("");
      void run(async () => {
        const result = await uploadVision(token, sessionId, received.blob, received.requestId);
        setObservations((current) => [result, ...current.filter((item) => item.id !== result.id)]);
        await selectVision(token, sessionId, result.id);
        setSelectedId(result.id); setSharedVision(false); setIntegrated(null);
        setMessage("Measurement received and connected to this session.");
        answer(true, "Measurement received and connected to this session.");
      }).catch((e) => {
        setError(e instanceof Error ? e.message : "Measurement could not be connected. Retry sending it from the vision panel.");
        answer(false, "Upload failed. Check the connection and try again.");
      })
        .finally(() => { inFlight.current.delete(received.requestId); });
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [bridgeOrigin, busy, locked, confirmed, run, sessionId, token]);

  async function perform(operation: () => Promise<void>) {
    setError(""); setMessage("");
    try { await run(operation); }
    catch (e) { setError(e instanceof Error ? e.message : "Operation failed. Try again."); }
  }

  async function select(id: string | null) {
    setIntegrated(null);
    pendingSelection.current = { id }; onConfirmationPending(true);
    let started = false;
    await perform(async () => {
      started = true;
      try {
        await selectVision(token, sessionId, id); setSelectedId(id); setSharedVision(false);
        pendingSelection.current = null; setSelectionUncertain(false); onConfirmationPending(false);
        setMessage(id ? "Measurement selected for this session." : "No measurement selected.");
      } catch (e) {
        if (e instanceof DemoApiError && e.status >= 400 && e.status < 500) {
          pendingSelection.current = null; setSelectionUncertain(false); onConfirmationPending(false);
        } else setSelectionUncertain(true);
        throw e;
      }
    });
    if (!started) { pendingSelection.current = null; setSelectionUncertain(false); onConfirmationPending(false); }
  }
  async function loadIntegrated() {
    await perform(async () => {
      const response = await fetch("/api/demo-integrated-context", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vision_session_id: sessionId }), cache: "no-store",
      });
      if (!response.ok) throw new Error("Integrated context unavailable. Check the data backend.");
      const result = await response.json();
      setIntegrated({ sleepHours: result.sleep?.sleep_context?.latest_measurement?.sleep_hours ?? null,
        visionStatus: result.vision?.status ?? "unavailable", visionSource: result.vision?.observation?.source ?? null,
        visionQuality: result.vision?.observation?.usability ?? null });
    });
  }
  async function confirm() {
    if (!checkIn) return;
    const body = pendingConfirmation.current ?? {
      expectedRevision: checkIn.revision,
      sharedObservationIds: checkIn.observations.filter((item) => sharedIds.includes(item.id)).map((item) => item.id),
      vision: { visionObservationId: selectedId, shareWithGround: selectedId !== null && sharedVision },
    };
    pendingConfirmation.current = body; onConfirmationPending(true);
    let started = false;
    await perform(async () => {
      started = true;
      try {
        const result = await confirmVision(token, checkIn.id, body);
        onCheckIn(result.checkIn); pendingConfirmation.current = null; onConfirmationPending(false);
        setMessage("Check-in confirmed. Report generation has started.");
      } catch (e) {
        if (e instanceof DemoApiError && e.status >= 400 && e.status < 500) {
          pendingConfirmation.current = null; onConfirmationPending(false);
        }
        throw e;
      }
    });
    if (!started) { pendingConfirmation.current = null; onConfirmationPending(false); }
  }

  return <section className={styles.panel} aria-labelledby="vision-title">
    <h2 id="vision-title">Eyelid measurement and check-in</h2>
    <p>The observations below belong to this session. Houston receives a report after you select what to share and confirm the check-in.</p>
    <p>The completed eyelid measurement is connected automatically. Its usability is reassessed on confirmation.</p>
    <p>The selected measurement is used by the agent and may be sent to the configured AI provider. Sharing with ground is chosen separately at confirmation.</p>
    {bridgeOrigin ? <>
      <button type="button" onClick={() => setShowVision((value) => !value)} disabled={busy || locked || confirmed}>
        {showVision ? "Close eyelid vision" : "Open eyelid vision"}
      </button>
      {showVision && !confirmed && <><p>Start the eyelid prototype at {bridgeOrigin}, calibrate and complete the measurement.</p>
        <iframe ref={iframe} title="Eyelid vision prototype" src={`${bridgeOrigin}/?agent_origin=${encodeURIComponent(window.location.origin)}`} allow="camera" referrerPolicy="origin" className={styles.visionFrame} />
      </>}
    </> : <p role="alert">Invalid eyelid prototype address.</p>}
    {observations.length > 0 && <div className={styles.visionList}>
      <h3>Imported measurements</h3>
      {observations.map((item) => <article key={item.id} className={styles.measurement}>
        <strong>{item.source === "synthetic" ? "Synthetic replay" : "Webcam measurement"}</strong>{" · "}
        {item.usability === "USABLE" ? "usable" : "insufficient"}
        <p>Valid time: {(item.validMs / 1000).toFixed(1)} s · Coverage: {percent(item.coverage)} · Closure fraction: {percent(item.closureFraction)}</p>
        <p>Interval: {item.startedAt && item.endedAt ? `${item.startedAt} – ${item.endedAt}` : "unavailable"}</p>
        {item.reasons.length > 0 && <p>Limitations: {item.reasons.map((reason) => reasonLabels[reason] ?? reason).join(", ")}.</p>}
        <button type="button" onClick={() => select(item.id)} disabled={busy || locked || confirmed || item.id === selectedId}>
          {item.id === selectedId ? "Selected" : "Select measurement"}
        </button>
      </article>)}
      {selectedId && <button type="button" onClick={() => select(null)} disabled={busy || locked || confirmed}>Clear selection</button>}
      {selectedId && astronautId === "astro-1" && <button type="button" onClick={() => void loadIntegrated()} disabled={busy || locked}>Verify sleep and vision context</button>}
      {integrated && <div className={styles.measurement} role="status">
        <strong>Integrated context · demo</strong>
        <p>Synthetic sleep: {integrated.sleepHours === null ? "no measurement available" : `${integrated.sleepHours} hours`}. Vision: {integrated.visionStatus}, source {integrated.visionSource ?? "unavailable"}, quality {integrated.visionQuality ?? "unavailable"}.</p>
        <p>The identities of the two datasets are not linked yet. This data is not a diagnosis.</p>
      </div>}
    </div>}
    {selectionUncertain && <><p>The selection may have been received. Retry to verify before continuing.</p>
      <button type="button" disabled={busy} onClick={() => { if (pendingSelection.current) void select(pendingSelection.current.id); }}>Retry selection</button></>}
    <h3>Check-in review</h3>
    {!checkIn ? <p>Send at least one message to create a draft, then choose what to share.</p> : <>
      <p>Status: {confirmed ? "confirmed" : "draft"}. Select the information you want to share with Houston. Speech is stored as transcribed observations; the report does not contain an audio recording.</p>
      {checkIn.observations.length === 0 ? <p>No self-reported observations in the draft.</p> :
        <fieldset disabled={busy || locked || confirmed}><legend>Personal observations to share</legend>
          {checkIn.observations.map((item) => <label className={styles.choice} key={item.id}>
            <input type="checkbox" checked={sharedIds.includes(item.id)} onChange={(event) => {
              const checked = event.target.checked;
              setSharedIds((ids) => checked ? [...ids, item.id] : ids.filter((id) => id !== item.id));
            }} />
            <span>{labels[item.field] ?? item.field}: {String(item.value)}{(item.field === "SLEEP_QUALITY" || item.field === "FATIGUE") ? (item.scaleMax ? ` / ${item.scaleMax}` : " (historical scale not specified)") : ""}</span>
          </label>)}
        </fieldset>}
      {selected && <label className={styles.choice}><input type="checkbox" checked={sharedVision} disabled={busy || locked || confirmed}
        onChange={(event) => setSharedVision(event.target.checked)} /><span>Share the selected {selected.source === "synthetic" ? "synthetic" : "webcam"} measurement with ground.</span></label>}
      {!selected && <p>No measurement selected: you can still confirm the check-in.</p>}
      {!confirmed && <button type="button" onClick={confirm} disabled={busy || selectionUncertain}>{locked && !selectionUncertain ? "Retry confirmation" : "Confirm check-in"}</button>}
      {locked && !selectionUncertain && !confirmed && <p>The confirmation may have been received. Retry without changing the selection.</p>}
      {confirmed && <div role="status">
        <p>When the report is ready, open <Link href="/">Houston → Data agent</Link> and select {astronautId} and this check-in.</p>
        <p>{generation === "READY" ? "Report ready for ground control." : generation === "FAILED" ? "Report generation failed." : generation === "UNAVAILABLE" ? "Report status unavailable." : "Report generation in progress."}</p>
        {generation === "READY" && noChangeReason && <p>No proposal: {noChangeReason}</p>}
        {(generation === "FAILED" || generation === "NOT_STARTED") && <button type="button" disabled={busy} onClick={() => void retryGeneration()}>Retry generation</button>}
      </div>}
    </>}
    {busy && <p role="status">Operation in progress…</p>}
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
