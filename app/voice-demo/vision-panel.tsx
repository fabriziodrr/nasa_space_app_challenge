"use client";

import { useRef, useState } from "react";
import { DemoApiError, confirmVision, selectVision, uploadVision } from "../../client/vision/demo-api";
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
  const uploadKey = useRef("");
  const pendingConfirmation = useRef<Confirmation | null>(null);
  const pendingSelection = useRef<{ id: string | null } | null>(null);
  const confirmed = checkIn?.status === "CONFIRMED";
  const selected = observations.find((item) => item.id === selectedId);

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
    <p>Importa il JSON esportato dalla feature palpebrale. La misura è sperimentale e non determina da sola la stanchezza. La sua utilizzabilità viene rivalutata alla conferma.</p>
    <p>La misura selezionata viene usata dall’agent e può essere inviata al provider AI configurato. La condivisione con Terra si sceglie separatamente al momento della conferma.</p>
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
