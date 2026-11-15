"use client";

import { useCallback, useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { CountUp } from "@/components/reactbits/CountUp";
import { SpotlightCard } from "@/components/reactbits/SpotlightCard";
import { TextType } from "@/components/reactbits/TextType";
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

const dateLabel = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

function SleepSummaryCards({ group }: { group: SleepGroup }) {
  const points = [...group.series].sort((a, b) => a.day_utc.localeCompare(b.day_utc));
  const first = points[0], last = points.at(-1);
  const period = first && last ? `${dateLabel(first.day_utc)} – ${dateLabel(last.day_utc)}` : "No observations";
  const coverage = group.coverage.expected_utc_days > 0 ? Math.round(group.coverage.days_with_episode / group.coverage.expected_utc_days * 100) : null;
  const change = group.trend.last_minus_first_hours;
  const fatigue = group.feedback_comparison.pairs.length ? group.feedback_comparison.pairs.reduce((sum, pair) => sum + pair.fatigue_rating, 0) / group.feedback_comparison.pairs.length : null;
  return <div className={styles.metrics}>
    <SpotlightCard className={styles.metricCard} spotlightColor="rgba(59, 26, 189, .1)"><span className={styles.metricSource}>SPACECRAFT DATA · SIMULATED</span><h4>Average sleep</h4><strong><CountUp value={group.summary.mean_sleep_hours.toFixed(1)} /><small> h</small></strong><p>Median {group.summary.median_sleep_hours.toFixed(1)} h · {group.summary.episode_count} episodes</p><time>{period}</time></SpotlightCard>
    <SpotlightCard className={styles.metricCard} spotlightColor="rgba(86, 198, 212, .1)"><span className={styles.metricSource}>DATA AVAILABILITY</span><h4>Days covered</h4><strong>{coverage === null ? "—" : <CountUp value={String(coverage)} />}<small> %</small></strong><p>{group.coverage.days_with_episode} of {group.coverage.expected_utc_days} days recorded</p><small className={styles.metricNote}>{group.coverage.missing_utc_days.length ? `${group.coverage.missing_utc_days.length} days missing or invalid` : "No missing days"}</small><time>{period}</time></SpotlightCard>
    <SpotlightCard className={styles.metricCard} spotlightColor="rgba(214, 167, 68, .1)"><span className={styles.metricSource}>SPACECRAFT DATA · SIMULATED</span><h4>Sleep change</h4><strong>{change === null ? "—" : `${change > 0 ? "+" : ""}${change.toFixed(1)}`}<small> h</small></strong><p>{change === null ? "At least two episodes needed" : change > 0 ? "Longer sleep in the last episode" : change < 0 ? "Shorter sleep in the last episode" : "Same duration in first and last episode"}</p><small className={styles.metricNote}>Last episode compared with first</small><time>{period}</time></SpotlightCard>
    <SpotlightCard className={`${styles.metricCard} ${styles.speechCard}`} spotlightColor="rgba(59, 26, 189, .1)"><span className={styles.metricSource}>DATA FROM SPEECH · SIMULATED</span><h4>Average reported fatigue</h4><strong>{fatigue === null ? "—" : <CountUp value={fatigue.toFixed(1)} />}<small> / 10</small></strong><p>{fatigue === null ? "No confirmed fatigue reports" : `${group.feedback_comparison.pair_count} confirmed reports paired with sleep`}</p><small className={styles.metricNote}>Reported score, not an optical measurement</small><time>Sleep period: {period}</time></SpotlightCard>
  </div>;
}

export function SleepDataPanel() {
  const [subject, setSubject] = useState("sleep-demo-14d");
  const [start, setStart] = useState("2026-11-01");
  const [end, setEnd] = useState("2026-11-15");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [status, setStatus] = useState("Loading sleep data…");
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
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
    } finally {
      setRefreshing(false);
    }
  }, [subject, start, end]);

  useEffect(() => { void refresh(); }, [refresh]);

  return <section className={styles.panel} aria-labelledby="sleep-data-title">
    <div className={`${styles.heading} ${styles.reveal}`}><div><span className={styles.kicker}><TextType text="CREW HEALTH / SLEEP MONITORING" typingSpeed={18} /></span><h2 id="sleep-data-title"><TextType text="Sleep & reported fatigue" typingSpeed={24} initialDelay={100} /></h2><p>Review sleep duration alongside the crew member’s reported fatigue.</p></div>
      <div className={styles.headingActions}><span className={styles.demoBadge}><i /> SYNTHETIC DEMO</span></div></div>
    <div className={styles.controls}>
      <label>Subject <input value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
      <label>From <input type="date" value={start} onChange={(event) => setStart(event.target.value)} /></label>
      <label>Until <input type="date" value={end} onChange={(event) => setEnd(event.target.value)} /></label>
       <button className={`${styles.refreshButton} ${refreshing ? styles.isRefreshing : ""}`} type="button" disabled={refreshing} onClick={() => void refresh()} aria-label="Refresh sleep data" title="Refresh sleep data"><RotateCcw size={15} aria-hidden="true" /></button>
    </div>
    {status && <p className={styles.notice} role="status">{status}</p>}
    {analysis?.truncated && <p className={styles.notice}>Partial data: the backend limit was reached.</p>}
    {analysis?.groups.map((group) => <article className={`${styles.group} ${styles.reveal}`} key={`${group.device_id}:${group.method}`}>
      <div className={styles.groupTitle}><div><span className={styles.sectionLabel}>PERIOD OVERVIEW</span><h3>Sleep summary</h3></div><span className={styles.source}>Simulated spacecraft data & confirmed reports</span></div>
      <SleepSummaryCards group={group} />
      <div className={styles.chartHeader}><div><span className={styles.sectionLabel}>LONGITUDINAL VIEW</span><h3>Sleep duration</h3><p>One recorded episode per UTC day</p></div><span className={styles.legend}><i /> SLEEP / HOURS</span></div>
       <div className={styles.chartWrap}><div className={styles.axis} aria-hidden="true"><span>12h</span><span>6h</span><span>0h</span></div><div className={styles.chart} aria-label="Sleep duration by day, scale capped at 12 hours">
         {group.series.map((point, index) => {
          const report = group.feedback_comparison.pairs.find((pair) => pair.sleep_observation_id === point.observation_id);
          return <div className={styles.day} key={point.observation_id} title={`${point.day_utc}: ${point.sleep_hours} hours${report ? `, fatigue ${report.fatigue_rating}/10` : ""}`}>
             <span>{point.sleep_hours.toFixed(1)}</span><div className={styles.barTrack}><div className={styles.bar} style={{ height: `${Math.min(point.sleep_hours / 12 * 100, 100)}%`, animationDelay: `${index * 45}ms` }} /></div><small>{point.day_utc.slice(5)}</small><small>{report ? `F ${report.fatigue_rating}` : "F —"}</small>
          </div>;
        })}
        </div></div>
      <div className={styles.infoGrid}><div><span className={styles.sectionLabel}>DATA COMPLETENESS</span><p>{group.coverage.missing_utc_days.length ? `${group.coverage.missing_utc_days.length} days have missing or invalid observations.` : "Every day in the selected period has a valid episode."}</p>{group.coverage.missing_utc_days.length > 0 && <details><summary>View missing dates</summary><p>{group.coverage.missing_utc_days.map(dateLabel).join(", ")}</p></details>}</div><div><span className={styles.sectionLabel}>READING THIS CHART</span><p>Bars show sleep duration; F shows reported fatigue out of 10. Missing reports stay blank. Changes describe recorded data and do not establish a diagnosis.</p><details><summary>Source details</summary><p>Device: {group.device_id} · Method: {group.method}. UTC dates; chart capped at 12 h, with full values labeled.</p></details></div></div>
      <details className={styles.tableDetails}><summary>View observations as a table</summary><div className={styles.tableScroll}><table><thead><tr><th scope="col">UTC date</th><th scope="col">Sleep duration</th><th scope="col">Reported fatigue</th></tr></thead><tbody>{group.series.map((point) => { const report = group.feedback_comparison.pairs.find((pair) => pair.sleep_observation_id === point.observation_id); return <tr key={point.observation_id}><td>{point.day_utc}</td><td>{point.sleep_hours.toFixed(1)} h</td><td>{report ? `${report.fatigue_rating} / 10` : "Not reported"}</td></tr>; })}</tbody></table></div></details>
    </article>)}
  </section>;
}
