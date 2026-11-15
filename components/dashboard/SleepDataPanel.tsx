"use client";

import { useCallback, useEffect, useState } from "react";
import { RotateCcw, Upload } from "lucide-react";
import demo from "@/server/examples/sleep_demo_14d.json";
import styles from "./SleepDataPanel.module.css";

type SleepGroup = {
  device_id: string; method: string;
  summary: { episode_count: number; mean_sleep_hours: number; median_sleep_hours: number };
  coverage: { expected_utc_days: number; days_with_episode: number; missing_utc_days: string[] };
  trend: { direction: string | null; last_minus_first_hours: number | null };
  feedback_comparison: { pair_count: number; pairs: { sleep_observation_id: string; fatigue_rating: number }[] };
  series: { day_utc: string; observation_id: string; sleep_hours: number }[];
};
type Analysis = { status: string; synthetic: boolean; truncated: boolean; groups: SleepGroup[] };

export function SleepDataPanel() {
  const [subject, setSubject] = useState("sleep-demo-14d");
  const [start, setStart] = useState("2026-11-01");
  const [end, setEnd] = useState("2026-11-15");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [status, setStatus] = useState("Loading sleep data…");
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");

  const refresh = useCallback(async () => {
    setStatus("Loading sleep data…");
    try {
      const params = new URLSearchParams({ subject, start: `${start}T00:00:00Z`, end: `${end}T00:00:00Z` });
      const response = await fetch(`/api/sleep-demo?${params}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Could not load analysis. Check the selected dates.");
      setAnalysis(result);
      setStatus(result.groups.length ? "" : "No synthetic sleep observations in this period.");
    } catch (error) {
      setAnalysis(null);
      setStatus(error instanceof Error ? error.message : "Could not load sleep data.");
    }
  }, [subject, start, end]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function importRecords(records: unknown) {
    setBusy(true);
    try {
      const response = await fetch("/api/sleep-demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(records) });
      const result = await response.json();
      if (response.status === 409) {
        await refresh();
        setStatus("Some observation IDs already exist. No records were imported; showing existing data.");
        return;
      }
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Import failed. Check the JSON format.");
      await refresh();
      setStatus(`Imported ${result.imported} synthetic observations. Select the matching subject and dates to view them.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Import failed.");
    } finally { setBusy(false); }
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    try { await importRecords(JSON.parse(await file.text())); }
    catch { setStatus("Invalid JSON file."); }
  }

  return <section className={styles.panel} aria-labelledby="sleep-data-title">
    <div className={styles.heading}><div><span className={styles.kicker}>CREW HEALTH / SLEEP MONITORING</span><h2 id="sleep-data-title">Sleep &amp; reported fatigue</h2><p>Review sleep duration alongside the crew member’s reported fatigue.</p></div>
      <div className={styles.headingActions}><span className={styles.demoBadge}><i /> SYNTHETIC DEMO</span><button type="button" disabled={busy} onClick={() => void importRecords(demo)}>Load sample</button></div></div>
    <div className={styles.controls}>
      <label>Subject <input value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
      <label>From <input type="date" value={start} onChange={(event) => setStart(event.target.value)} /></label>
      <label>Until <input type="date" value={end} onChange={(event) => setEnd(event.target.value)} /></label>
       <button className={styles.refreshButton} type="button" onClick={() => void refresh()} aria-label="Refresh sleep data" title="Refresh sleep data"><RotateCcw size={15} aria-hidden="true" /></button>
       <div className={styles.upload}>
         <span className={styles.uploadLabel}>Import synthetic JSON</span>
         <label className={styles.filePicker}>
           <input
             type="file"
             accept="application/json,.json"
             disabled={busy}
             onChange={(event) => {
               const file = event.target.files?.[0];
               setFileName(file?.name ?? "");
               void upload(file);
               event.target.value = "";
             }}
           />
           <span className={styles.filePickerButton} aria-hidden="true"><Upload size={17} strokeWidth={2.2} /></span>
           <span className={styles.fileName}>{fileName || "No file selected"}</span>
         </label>
       </div>
    </div>
    {status && <p className={styles.notice} role="status">{status}</p>}
    {analysis?.truncated && <p className={styles.notice}>Partial data: the backend limit was reached.</p>}
    {analysis?.groups.map((group) => <article className={styles.group} key={`${group.device_id}:${group.method}`}>
      <div className={styles.groupTitle}><div><span className={styles.sectionLabel}>PERIOD OVERVIEW</span><h3>Sleep summary</h3></div><span className={styles.source}>Device: {group.device_id} · Method: {group.method}</span></div>
      <div className={styles.metrics}>
        <div><span>Average duration</span><strong>{group.summary.mean_sleep_hours.toFixed(2)} <small>h</small></strong><em>Per recorded sleep episode</em></div>
        <div><span>Data coverage</span><strong>{group.coverage.days_with_episode} <small>/ {group.coverage.expected_utc_days} days</small></strong><em>Days with a valid episode</em></div>
        <div><span>Duration trend</span><strong>{group.trend.direction ?? "Not available"}</strong><em>{group.trend.last_minus_first_hours === null ? "More data needed" : `${group.trend.last_minus_first_hours > 0 ? "+" : ""}${group.trend.last_minus_first_hours.toFixed(1)} h, last vs first`}</em></div>
        <div><span>Fatigue reports</span><strong>{group.feedback_comparison.pair_count}</strong><em>Confirmed, paired with sleep</em></div>
      </div>
      <div className={styles.chartHeader}><div><span className={styles.sectionLabel}>LONGITUDINAL VIEW</span><h3>Sleep duration</h3><p>One recorded episode per UTC day</p></div><span className={styles.legend}><i /> SLEEP / HOURS</span></div>
      <div className={styles.chartWrap}><div className={styles.axis} aria-hidden="true"><span>12h</span><span>6h</span><span>0h</span></div><div className={styles.chart} aria-label="Sleep duration by day, scale capped at 12 hours">
        {group.series.map((point) => {
          const report = group.feedback_comparison.pairs.find((pair) => pair.sleep_observation_id === point.observation_id);
          return <div className={styles.day} key={point.observation_id} title={`${point.day_utc}: ${point.sleep_hours} hours${report ? `, fatigue ${report.fatigue_rating}/10` : ""}`}>
            <span>{point.sleep_hours.toFixed(1)}</span><div className={styles.barTrack}><div className={styles.bar} style={{ height: `${Math.min(point.sleep_hours / 12 * 100, 100)}%` }} /></div><small>{point.day_utc.slice(5)}</small><small>{report ? `F ${report.fatigue_rating}` : "F —"}</small>
          </div>;
        })}
      </div></div>
      <div className={styles.infoGrid}><div><span className={styles.sectionLabel}>DATA COMPLETENESS</span><p>Missing or invalid UTC days: {group.coverage.missing_utc_days.join(", ") || "none"}.</p></div><div><span className={styles.sectionLabel}>INTERPRETATION</span><p>F = confirmed self-reported fatigue / 10. Chart is capped at 12 h; values above it remain labeled. Trends are descriptive, not a diagnosis.</p></div></div>
      <details className={styles.tableDetails}><summary>View observations as a table</summary><div className={styles.tableScroll}><table><thead><tr><th scope="col">UTC date</th><th scope="col">Sleep duration</th><th scope="col">Reported fatigue</th></tr></thead><tbody>{group.series.map((point) => { const report = group.feedback_comparison.pairs.find((pair) => pair.sleep_observation_id === point.observation_id); return <tr key={point.observation_id}><td>{point.day_utc}</td><td>{point.sleep_hours.toFixed(1)} h</td><td>{report ? `${report.fatigue_rating} / 10` : "Not reported"}</td></tr>; })}</tbody></table></div></details>
    </article>)}
  </section>;
}
