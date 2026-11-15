"use client";

import { useEffect, useRef, useState } from "react";
import { DemoApiError, confirmVision, selectVision, uploadVision } from "../../client/vision/demo-api";
import { parseVisionBridgeMessage, visionOrigin, VISION_BRIDGE_CHANNEL } from "../../client/vision/bridge";
import type { CheckIn, VisionObservation } from "../../server/agent/contracts";
import styles from "./voice-demo.module.css";

type Confirmation = { expectedRevision: number; sharedObservationIds: string[]; vision: { visionObservationId: string | null; shareWithGround: boolean } };
type Props = { token: string; sessionId: string; checkIn: CheckIn | null; busy: boolean; locked: boolean;
  run<T>(operation: () => Promise<T>): Promise<T>; onCheckIn(checkIn: CheckIn): void; onConfirmationPending(value: boolean): void };

const labels: Record<string, string> = { SLEEP_HOURS: "Sleep hours", SLEEP_QUALITY: "Sleep quality (1–5)",
  FATIGUE: "Fatigue (1–5)", PHYSICAL_NOTES: "Physical condition", MENTAL_STATE: "Mental state", STRESSOR_NOTES: "Stressors" };
const reasonLabels: Record<string, string> = { NO_VALID_TIME: "no valid time", TOO_SHORT: "measurement too short",
  LOW_COVERAGE: "insufficient coverage", STALE: "stale measurement", INTERRUPTED: "interrupted measurement",
  SYNTHETIC_TIME_UNAVAILABLE: "real time unavailable for the synthetic replay" };
const percent = (value: number | null) => value === null ? "unavailable" : `${(value * 100).toFixed(1)}%`;

export function VisionPanel({ token, sessionId, checkIn, busy, locked, run, onCheckIn, onConfirmationPending }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [observations, setObservations] = useState<VisionObservation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sharedVision, setSharedVision] = useState(false);
  const [sharedIds, setSharedIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selectionUncertain, setSelectionUncertain] = useState(false);
  const [showVision, setShowVision] = useState(false);
  const iframe = useRef<HTMLIFrameElement>(null);
  const inFlight = useRef(new Set<string>());
  const uploadKey = useRef("");
  const pendingConfirmation = useRef<Confirmation | null>(null);
  const pendingSelection = useRef<{ id: string | null } | null>(null);
  const confirmed = checkIn?.status === "CONFIRMED";
  const selected = observations.find((item) => item.id === selectedId);
  const bridgeOrigin = (() => { try { return visionOrigin(process.env.NEXT_PUBLIC_VISION_ORIGIN); } catch { return null; } })();

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
        setMessage("Measurement received. Select it to use it in the conversation.");
        answer(true, "Measurement received by the agent. Select it on the main page.");
      }).catch(() => answer(false, "Upload failed. Check the connection and try again."))
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

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null); uploadKey.current = crypto.randomUUID(); setMessage(""); setError("");
  }
  async function upload() {
    if (!file) return;
    const chosen = file;
    await perform(async () => {
      const result = await uploadVision(token, sessionId, chosen, uploadKey.current);
      setObservations((current) => [result, ...current.filter((item) => item.id !== result.id)]);
      setMessage("File imported. Select the measurement to use it in the conversation.");
    });
  }
  async function select(id: string | null) {
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
    <p>Import the JSON exported by the eyelid feature. The measurement is experimental and does not by itself determine fatigue. Its usability is reassessed on confirmation.</p>
    <p>The selected measurement is used by the agent and may be sent to the configured AI provider. Sharing with ground is chosen separately at confirmation.</p>
    {bridgeOrigin ? <>
      <button type="button" onClick={() => setShowVision((value) => !value)} disabled={busy || locked || confirmed}>
        {showVision ? "Close eyelid vision" : "Open eyelid vision"}
      </button>
      {showVision && !confirmed && <><p>Start the eyelid prototype at {bridgeOrigin}, calibrate and complete the measurement; then use the send button in the prototype.</p>
        <iframe ref={iframe} title="Eyelid vision prototype" src={`${bridgeOrigin}/`} allow="camera" referrerPolicy="origin" className={styles.visionFrame} />
      </>}
    </> : <p role="alert">Invalid eyelid prototype address. You can use file import.</p>}
    <label htmlFor="vision-file">Measurement JSON file</label>
    <input id="vision-file" type="file" accept="application/json,.json" onChange={onFileChange} disabled={busy || locked || confirmed} />
    <button type="button" onClick={upload} disabled={!file || busy || locked || confirmed}>Import measurement</button>
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
    </div>}
    {selectionUncertain && <><p>The selection may have been received. Retry to verify before continuing.</p>
      <button type="button" disabled={busy} onClick={() => { if (pendingSelection.current) void select(pendingSelection.current.id); }}>Retry selection</button></>}
    <h3>Check-in review</h3>
    {!checkIn ? <p>Send at least one message to create a draft, then choose what to share.</p> : <>
      <p>Status: {confirmed ? "confirmed" : "draft"}. Select the information you want to share with ground.</p>
      {checkIn.observations.length === 0 ? <p>No self-reported observations in the draft.</p> :
        <fieldset disabled={busy || locked || confirmed}><legend>Personal observations to share</legend>
          {checkIn.observations.map((item) => <label className={styles.choice} key={item.id}>
            <input type="checkbox" checked={sharedIds.includes(item.id)} onChange={(event) => {
              const checked = event.target.checked;
              setSharedIds((ids) => checked ? [...ids, item.id] : ids.filter((id) => id !== item.id));
            }} />
            <span>{labels[item.field] ?? item.field}: {String(item.value)}</span>
          </label>)}
        </fieldset>}
      {selected && <label className={styles.choice}><input type="checkbox" checked={sharedVision} disabled={busy || locked || confirmed}
        onChange={(event) => setSharedVision(event.target.checked)} /><span>Share the selected {selected.source === "synthetic" ? "synthetic" : "webcam"} measurement with ground.</span></label>}
      {!selected && <p>No measurement selected: you can still confirm the check-in.</p>}
      {!confirmed && <button type="button" onClick={confirm} disabled={busy || selectionUncertain}>{locked && !selectionUncertain ? "Retry confirmation" : "Confirm check-in"}</button>}
      {locked && !selectionUncertain && !confirmed && <p>The confirmation may have been received. Retry without changing the selection.</p>}
    </>}
    {busy && <p role="status">Operation in progress…</p>}
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
