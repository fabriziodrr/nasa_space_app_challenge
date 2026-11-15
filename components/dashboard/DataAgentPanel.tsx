"use client";

import { useState } from "react";
import styles from "./SleepDataPanel.module.css";

type Report = {
  schema_version: string; identity_link: string; snapshot_id: string;
  sleep: { status: string; synthetic: boolean; observation: { sleep_hours: number; observed_at: string } | null };
  reported_state: { status: string; observation: { fatigue_rating: number | null } | null };
  vision: { status: string; observation: { source: string; usability: string; coverage: number | null; closureFraction: number | null; reasons: string[] } | null };
};

export function DataAgentPanel() {
  const [session, setSession] = useState("");
  const [token, setToken] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function load(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage(""); setReport(null);
    try {
      const response = await fetch("/api/demo-data-agent", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ vision_session_id: session }), cache: "no-store",
      });
      if (!response.ok) throw new Error(response.status === 401 ? "Demo token not recognized." : "Report unavailable: check the session and local services.");
      const result: Report = await response.json();
      if (result.schema_version !== "data-agent-demo-1") throw new Error("Unrecognized report format.");
      setReport(result);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Error nel caricamento."); }
    finally { setBusy(false); }
  }

  const eye = report?.vision.observation;
  return <section className={styles.panel} aria-labelledby="agent-report-title">
    <div className={styles.heading}><div><span className={styles.kicker}>DATA AGENT / DEMO</span><h2 id="agent-report-title">Sleep and eye measurements</h2><p>Load the selected vision session report. Sleep data is simulated.</p></div><span className={styles.demoBadge}>LOCAL DEMO</span></div>
    <form className={styles.controls} onSubmit={(event) => void load(event)}>
      <label>Vision session <input required value={session} onChange={(event) => setSession(event.target.value)} placeholder="ID dalla demo vision" /></label>
      <label>Token demo <input required type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} /></label>
      <button type="submit" disabled={busy}>{busy ? "Loading…" : "Load report"}</button>
    </form>
    {message && <p className={styles.notice} role="alert">{message}</p>}
    {report && <div className={styles.group} aria-live="polite">
      <div className={styles.groupTitle}><div><span className={styles.sectionLabel}>RAPPORTO AGENTE DATI</span><h3>Contesto disponibile</h3></div><span className={styles.source}>Snapshot {report.snapshot_id.slice(0, 12)}</span></div>
      <div className={styles.metrics}>
        <div><span>Latest simulated sleep</span><strong>{report.sleep.observation ? `${report.sleep.observation.sleep_hours} h` : "Unavailable"}</strong><em>{report.sleep.observation?.observed_at ?? "No observation"}</em></div>
        <div><span>Reported fatigue</span><strong>{report.reported_state.observation?.fatigue_rating != null ? `${report.reported_state.observation.fatigue_rating} / 10` : "Unavailable"}</strong><em>Confirmed feedback</em></div>
        <div><span>Misura vision</span><strong>{eye?.usability ?? report.vision.status}</strong><em>Source: {eye?.source ?? "unavailable"}</em></div>
        <div><span>Vision coverage</span><strong>{eye?.coverage != null ? `${(eye.coverage * 100).toFixed(1)}%` : "Unavailable"}</strong><em>Valid time fraction</em></div>
      </div>
      <p className={styles.notice}>Shared identities have not been verified. Data is presented separately and does not establish a diagnosis.</p>
      {eye?.reasons.length ? <p className={styles.source}>Measurement limitations: {eye.reasons.join(", ")}</p> : null}
      {report.vision.status === "unavailable" && <p className={styles.notice}>Servizio vision unavailable: i dati sonno restano consultabili.</p>}
    </div>}
  </section>;
}
