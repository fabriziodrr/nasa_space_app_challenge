"use client";

import { useEffect, useState } from "react";
import { selectDemoProfile } from "@/client/demo-session";
import { getReports } from "@/client/dashboard/mission-api";
import { demoCrewMappings } from "@/server/agent/demo-crew";
import type { GroundReport } from "@/server/agent/contracts";
import { reportContent } from "@/client/dashboard/report-content";
import { ReportData } from "./ReportData";
import { Dropdown } from "../ui/Dropdown";
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
      <div><label htmlFor="data-agent-astronaut">Astronaut</label><Dropdown id="data-agent-astronaut" label="Astronaut" value={astronautId} onChange={(value) => { setReports([]); setSelectedId(""); setAstronautId(value); }} disabled={busy} options={demoCrewMappings.map((member) => ({ value: member.astronautId, label: member.name, initials: member.name.split(" ").map((part) => part[0]).join("") }))} /></div>
      {reports.length > 0 && <div><label htmlFor="data-agent-checkin">Check-in</label><Dropdown id="data-agent-checkin" label="Check-in" value={selectedId} onChange={setSelectedId} options={reports.map((item) => ({ value: item.id, label: new Date(item.generatedAt).toLocaleString() }))} /></div>}
      <button type="button" disabled={busy} onClick={() => setRefresh((value) => value + 1)}>{busy ? "Loading…" : "Refresh"}</button>
    </div>
    {message && <p className={styles.notice} role="status">{message}</p>}
    {report && <article className={styles.group} aria-live="polite">
      <div className={styles.groupTitle}><div><span className={styles.sectionLabel}>SHARED REPORT</span><h3>Check-in report</h3></div><span className={styles.source}>{new Date(report.generatedAt).toLocaleString()}</span></div>
      <h4>Findings</h4>
      <ReportData report={report} />
      {report.discrepancies.length > 0 && <><h4>Differences to review</h4><ul>{report.discrepancies.map((finding, index) => <li key={index}>{reportContent(finding.text)}</li>)}</ul></>}
      {report.uncertainties.length > 0 && <><h4>Limitations</h4><ul>{report.uncertainties.map((item, index) => <li key={index}>{reportContent(item)}</li>)}</ul></>}
      {report.humanReview.required && <p className={styles.notice}>Human review: {reportContent(report.humanReview.reason)}</p>}
    </article>}
  </section>;
}
