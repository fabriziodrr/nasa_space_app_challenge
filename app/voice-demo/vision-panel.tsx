"use client";

import { useEffect, useRef, useState } from "react";
import { DemoApiError, confirmVision, selectVision, uploadVision } from "../../client/vision/demo-api";
import { parseVisionBridgeMessage, visionOrigin, VISION_BRIDGE_CHANNEL } from "../../client/vision/bridge";
import type { CheckIn, VisionObservation } from "../../server/agent/contracts";
import styles from "./voice-demo.module.css";

type Confirmation = { expectedRevision: number; sharedObservationIds: string[]; vision: { visionObservationId: string | null; shareWithGround: boolean } };
type Props = { token: string; sessionId: string; checkIn: CheckIn | null; busy: boolean; locked: boolean;
  run<T>(operation: () => Promise<T>): Promise<T>; onCheckIn(checkIn: CheckIn): void; onConfirmationPending(value: boolean): void };

const labels: Record<string, string> = { SLEEP_HOURS: "Ore di sonno", SLEEP_QUALITY: "Qualità del sonno (1–5)",
  FATIGUE: "Stanchezza (1–5)", PHYSICAL_NOTES: "Condizioni fisiche" };
const reasonLabels: Record<string, string> = { NO_VALID_TIME: "nessun tempo valido", TOO_SHORT: "misura troppo breve",
  LOW_COVERAGE: "copertura insufficiente", STALE: "misura non recente", INTERRUPTED: "misura interrotta",
  SYNTHETIC_TIME_UNAVAILABLE: "tempo reale non disponibile per il replay sintetico" };
const percent = (value: number | null) => value === null ? "non disponibile" : `${(value * 100).toFixed(1)}%`;

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
  const [integrated, setIntegrated] = useState<{ sleepHours: number | null; visionStatus: string; visionSource: string | null; visionQuality: string | null } | null>(null);
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
      if (busy || locked || confirmed) { answer(false, "Completa l'operazione in corso prima di inviare la misura."); return; }
      inFlight.current.add(received.requestId); setError(""); setMessage("");
      void run(async () => {
        const result = await uploadVision(token, sessionId, received.blob, received.requestId);
        setObservations((current) => [result, ...current.filter((item) => item.id !== result.id)]);
        setMessage("Misura ricevuta. Selezionala per usarla nella conversazione.");
        answer(true, "Misura ricevuta dall'agent. Selezionala nella pagina principale.");
      }).catch(() => answer(false, "Invio non riuscito. Controlla la connessione e riprova."))
        .finally(() => { inFlight.current.delete(received.requestId); });
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [bridgeOrigin, busy, locked, confirmed, run, sessionId, token]);

  async function perform(operation: () => Promise<void>) {
    setError(""); setMessage("");
    try { await run(operation); }
    catch (e) { setError(e instanceof Error ? e.message : "Operazione non riuscita. Riprova."); }
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
      setMessage("File importato. Seleziona la misura per usarla nella conversazione.");
    });
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
        setMessage(id ? "Misura selezionata per questa sessione." : "Nessuna misura selezionata.");
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
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ vision_session_id: sessionId }), cache: "no-store",
      });
      if (!response.ok) throw new Error("Contesto integrato non disponibile. Controlla il backend dati e il token demo.");
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
        setMessage("Check-in confermato. La generazione del report è stata avviata.");
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
    <h2 id="vision-title">Misura palpebrale e check-in</h2>
    <p>Codice sessione per la dashboard: <code>{sessionId}</code></p>
    <p>Importa il JSON esportato dalla feature palpebrale. La misura è sperimentale e non determina da sola la stanchezza. La sua utilizzabilità viene rivalutata alla conferma.</p>
    <p>La misura selezionata viene usata dall’agent e può essere inviata al provider AI configurato. La condivisione con Terra si sceglie separatamente al momento della conferma.</p>
    {bridgeOrigin ? <>
      <button type="button" onClick={() => setShowVision((value) => !value)} disabled={busy || locked || confirmed}>
        {showVision ? "Chiudi visione palpebrale" : "Apri visione palpebrale"}
      </button>
      {showVision && !confirmed && <><p>Avvia il prototipo palpebrale su {bridgeOrigin}, calibra e completa la misura; poi usa il pulsante di invio nel prototipo.</p>
        <iframe ref={iframe} title="Prototipo di visione palpebrale" src={`${bridgeOrigin}/`} allow="camera" referrerPolicy="origin" className={styles.visionFrame} />
      </>}
    </> : <p role="alert">Indirizzo del prototipo palpebrale non valido. Puoi usare l’importazione del file.</p>}
    <label htmlFor="vision-file">File JSON della misura</label>
    <input id="vision-file" type="file" accept="application/json,.json" onChange={onFileChange} disabled={busy || locked || confirmed} />
    <button type="button" onClick={upload} disabled={!file || busy || locked || confirmed}>Importa misura</button>
    {observations.length > 0 && <div className={styles.visionList}>
      <h3>Misure importate</h3>
      {observations.map((item) => <article key={item.id} className={styles.measurement}>
        <strong>{item.source === "synthetic" ? "Replay sintetico" : "Misura webcam"}</strong>{" · "}
        {item.usability === "USABLE" ? "utilizzabile" : "insufficiente"}
        <p>Tempo valido: {(item.validMs / 1000).toFixed(1)} s · Copertura: {percent(item.coverage)} · Quota di chiusura: {percent(item.closureFraction)}</p>
        <p>Intervallo: {item.startedAt && item.endedAt ? `${item.startedAt} – ${item.endedAt}` : "non disponibile"}</p>
        {item.reasons.length > 0 && <p>Limitazioni: {item.reasons.map((reason) => reasonLabels[reason] ?? reason).join(", ")}.</p>}
        <button type="button" onClick={() => select(item.id)} disabled={busy || locked || confirmed || item.id === selectedId}>
          {item.id === selectedId ? "Selezionata" : "Seleziona misura"}
        </button>
      </article>)}
      {selectedId && <button type="button" onClick={() => select(null)} disabled={busy || locked || confirmed}>Rimuovi selezione</button>}
      {selectedId && <button type="button" onClick={() => void loadIntegrated()} disabled={busy || locked}>Verifica contesto sonno e vision</button>}
      {integrated && <div className={styles.measurement} role="status">
        <strong>Contesto integrato · prova</strong>
        <p>Sonno sintetico: {integrated.sleepHours === null ? "nessuna misura disponibile" : `${integrated.sleepHours} ore`}. Vision: {integrated.visionStatus}, origine {integrated.visionSource ?? "non disponibile"}, qualità {integrated.visionQuality ?? "non disponibile"}.</p>
        <p>Le identità dei due dataset non sono ancora collegate. I dati non costituiscono una diagnosi.</p>
      </div>}
    </div>}
    {selectionUncertain && <><p>La selezione potrebbe essere stata ricevuta. Riprova per verificarla prima di continuare.</p>
      <button type="button" disabled={busy} onClick={() => { if (pendingSelection.current) void select(pendingSelection.current.id); }}>Riprova selezione</button></>}
    <h3>Revisione del check-in</h3>
    {!checkIn ? <p>Invia almeno un messaggio per creare una bozza, poi scegli cosa condividere.</p> : <>
      <p>Stato: {confirmed ? "confermato" : "bozza"}. Seleziona le informazioni che vuoi condividere con Terra.</p>
      {checkIn.observations.length === 0 ? <p>Nessuna osservazione dichiarata nella bozza.</p> :
        <fieldset disabled={busy || locked || confirmed}><legend>Osservazioni personali da condividere</legend>
          {checkIn.observations.map((item) => <label className={styles.choice} key={item.id}>
            <input type="checkbox" checked={sharedIds.includes(item.id)} onChange={(event) => {
              const checked = event.target.checked;
              setSharedIds((ids) => checked ? [...ids, item.id] : ids.filter((id) => id !== item.id));
            }} />
            <span>{labels[item.field] ?? item.field}: {String(item.value)}</span>
          </label>)}
        </fieldset>}
      {selected && <label className={styles.choice}><input type="checkbox" checked={sharedVision} disabled={busy || locked || confirmed}
        onChange={(event) => setSharedVision(event.target.checked)} /><span>Condividi con Terra la misura {selected.source === "synthetic" ? "sintetica" : "webcam"} selezionata.</span></label>}
      {!selected && <p>Nessuna misura selezionata: puoi comunque confermare il check-in.</p>}
      {!confirmed && <button type="button" onClick={confirm} disabled={busy || selectionUncertain}>{locked && !selectionUncertain ? "Riprova la conferma" : "Conferma check-in"}</button>}
      {locked && !selectionUncertain && !confirmed && <p>La conferma potrebbe essere stata ricevuta. Riprova senza cambiare la selezione.</p>}
    </>}
    {busy && <p role="status">Operazione in corso…</p>}
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
