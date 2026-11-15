"use client";

import { useEffect, useState } from "react";
import { selectDemoProfile } from "@/client/demo-session";
import { getReports } from "@/client/dashboard/mission-api";
import { demoCrewMappings } from "@/server/agent/demo-crew";
import type { GroundReport } from "@/server/agent/contracts";
import styles from "./SleepDataPanel.module.css";

export function DataAgentPanel() {
  const [astronautId, setAstronautId] = useState<string>(demoCrewMappings[0].astronautId);
  const [reports, setReports] = useState<GroundReport[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setBusy(true); setMessage(""); setReports([]); setSelectedId("");
      try {
        // This panel is in the Houston view: use only ground-scoped, shared reports.
        await selectDemoProfile("ground");
        const page = await getReports("", astronautId);
        if (page.items.some((item) => item.astronautId !== astronautId)) throw new Error("Report profile mismatch.");
        if (!cancelled) {
          setReports(page.items);
          setSelectedId(page.items[0]?.id ?? "");
          if (!page.items.length) setMessage("No shared report is available for this astronaut yet. Confirm a check-in to generate one.");
        }
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Unable to load shared reports.");
      } finally { if (!cancelled) setBusy(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [astronautId, refresh]);

  const report = reports.find((item) => item.id === selectedId);
  return <section className={styles.panel} aria-labelledby="agent-report-title">
    <div className={styles.heading}><div><span className={styles.kicker}>DATA AGENT / DEMO</span><h2 id="agent-report-title">Shared operational report</h2><p>Confirmed observations and sensor data from the same check-in.</p></div><span className={styles.demoBadge}>LOCAL DEMO</span></div>
    <div className={styles.controls}>
      <label>Astronaut <select value={astronautId} onChange={(event) => { setReports([]); setSelectedId(""); setAstronautId(event.target.value); }} disabled={busy}>
        {demoCrewMappings.map((member) => <option key={member.astronautId} value={member.astronautId}>{member.name}</option>)}
      </select></label>
      {reports.length > 0 && <label>Check-in <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
        {reports.map((item) => <option key={item.id} value={item.id}>{new Date(item.generatedAt).toLocaleString()} · {item.checkInId}</option>)}
      </select></label>}
      <button type="button" disabled={busy} onClick={() => setRefresh((value) => value + 1)}>{busy ? "Loading…" : "Refresh"}</button>
    </div>
    {message && <p className={styles.notice} role="status">{message}</p>}
    {report && <article className={styles.group} aria-live="polite">
      <div className={styles.groupTitle}><div><span className={styles.sectionLabel}>SHARED REPORT</span><h3>Check-in {report.checkInId}</h3></div><span className={styles.source}>{new Date(report.generatedAt).toLocaleString()}</span></div>
      <h4>Findings</h4>
      {report.findings.length ? <ul>{report.findings.map((finding, index) => <li key={`${finding.source}-${index}`}><strong>{finding.source}:</strong> {finding.text}</li>)}</ul> : <p>No shared findings.</p>}
      {report.discrepancies.length > 0 && <><h4>Differences to review</h4><ul>{report.discrepancies.map((finding, index) => <li key={index}>{finding.text}</li>)}</ul></>}
      {report.uncertainties.length > 0 && <><h4>Limitations</h4><ul>{report.uncertainties.map((item, index) => <li key={index}>{item}</li>)}</ul></>}
      {report.humanReview.required && <p className={styles.notice}>Human review: {report.humanReview.reason}</p>}
    </article>}
  </section>;
}
