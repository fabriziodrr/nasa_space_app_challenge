"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { demoCrew, type DemoCrewProfile } from "@/server/examples/crew_profiles";
import { CountUp } from "@/components/reactbits/CountUp";
import { SpotlightCard } from "@/components/reactbits/SpotlightCard";
import { CrewProfileSelector } from "@/components/dashboard/CrewProfileSelector";
import { selectDemoProfile } from "@/client/demo-session";
import { getReports } from "@/client/dashboard/mission-api";
import { demoCrewMappings } from "@/server/agent/demo-crew";
import type { GroundReport } from "@/server/agent/contracts";
import { TextType } from "@/components/reactbits/TextType";
import styles from "./CrewDataDashboard.module.css";

type Trial = { status: "response" | "false_start" | "missed"; rt_ms?: number };
type DataView = "cognitive" | "sleep" | "vigilance" | "vision";
type SleepPoint = { period_end: string; observation_id: string; sleep_hours: number; sleep_efficiency_percent?: number | null; awakenings_count?: number | null; sleep_latency_minutes?: number | null; wake_after_sleep_onset_minutes?: number | null; sleep_stages?: { rem_minutes: number; method: string } | null; heart_rate_variability?: { value_ms: number; method: string } | null };
type SleepAnalysis = { groups: { device_id: string; method: string; series: SleepPoint[] }[]; truncated: boolean };

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
}

export function CrewDataDashboard({ onBack }: { onBack: () => void }) {
  const [activeView, setActiveView] = useState<DataView>("cognitive");
  const [profileId, setProfileId] = useState(demoCrew[0].id);
  const profile = demoCrew.find((item) => item.id === profileId) ?? demoCrew[0];
  const mood = profile.mood;
  const trials = profile.trials;
  const responses = trials.filter((trial) => trial.status === "response" && trial.rt_ms !== undefined && trial.rt_ms >= 100).map((trial) => trial.rt_ms as number);
  const falseStarts = trials.filter((trial) => trial.status === "false_start" || (trial.status === "response" && trial.rt_ms !== undefined && trial.rt_ms < 100)).length;
  const missed = trials.filter((trial) => trial.status === "missed").length;
  const lapses = responses.filter((value) => value >= 500).length;
  return (
    <section className={styles.workspace} aria-label="Crew readiness data">
      <div className={styles.dataShell}>
        <aside className={styles.sidebar} aria-label="Crew data categories">
          <div className={styles.sidebarHeader}>
            <button className={styles.backButton} type="button" onClick={onBack} aria-label="Back to dashboard" title="Back to dashboard">
              <ArrowLeft size={15} aria-hidden="true" />
            </button>
            <span>CREW DATA</span>
          </div>
          <nav className={styles.sidebarNav}>
            <DataViewButton active={activeView === "cognitive"} index="01" label="Cognitive state" detail="Alertness · mood" onClick={() => setActiveView("cognitive")} />
            <DataViewButton active={activeView === "sleep"} index="02" label="Sleep recovery" detail="Duration · quality" onClick={() => setActiveView("sleep")} />
            <DataViewButton active={activeView === "vigilance"} index="03" label="Vigilance test" detail="Reaction · trials" onClick={() => setActiveView("vigilance")} />
            <DataViewButton active={activeView === "vision"} index="04" label="Vision report" detail="Session · data agent" onClick={() => setActiveView("vision")} />
          </nav>
          <div className={styles.sidebarFooter}>DEMO DATA VIEWS</div>
        </aside>

         <main className={`${styles.dataPanel} ${styles.reveal}`}>
           {activeView === "cognitive" && <DataPanelHeader index="01" title="Cognitive state" description={`Fictional self-report · ${mood.observed_at}`} profile={profile} profiles={demoCrew} onProfileChange={setProfileId} />}
            {activeView === "sleep" && <DataPanelHeader index="02" title="Sleep recovery" description="" profile={profile} profiles={demoCrew} onProfileChange={setProfileId} />}
           {activeView === "vigilance" && <DataPanelHeader index="03" title="Vigilance test" description={`${responses.length} valid responses · ${trials.length} total trials · synthetic demo`} profile={profile} profiles={demoCrew} onProfileChange={setProfileId} />}
           {activeView === "vision" && <DataPanelHeader index="04" title="Vision report" description="Selected vision session and data agent context" profile={profile} profiles={demoCrew} onProfileChange={setProfileId} />}
          <div className={styles.panelContent}>
            {activeView === "cognitive" && <CognitiveBars alertness={mood.alertness} mood={mood.mood_rating} sleepQuality={mood.sleep_quality} />}
            {activeView === "sleep" && <SleepRecovery key={profile.id} profile={profile} />}
            {activeView === "vigilance" && <div className={styles.vigilanceLayout}><ReactionChart trials={trials} /><TrialSummary responses={responses.length} falseStarts={falseStarts} missed={missed} lapses={lapses} medianReaction={median(responses)} /></div>}
            {activeView === "vision" && <VisionReport key={profile.id} profileId={profile.id} />}
          </div>
        </main>
      </div>

    </section>
  );
}

function DataViewButton({ active, index, label, detail, onClick }: { active: boolean; index: string; label: string; detail: string; onClick: () => void }) {
  return <button className={`${styles.sidebarButton} ${active ? styles.sidebarButtonActive : ""}`} type="button" aria-pressed={active} onClick={onClick}><span className={styles.sidebarIndex}>{index}</span><span className={styles.sidebarButtonCopy}><strong>{label}</strong><small>{detail}</small></span><span className={styles.sidebarArrow} aria-hidden="true">↗</span></button>;
}

function DataPanelHeader({ index, title, description, profile, profiles, onProfileChange }: { index: string; title: string; description: string; profile: DemoCrewProfile; profiles: DemoCrewProfile[]; onProfileChange: (profileId: string) => void }) {
  return (
    <header className={styles.panelHeader}>
      <div className={styles.panelHeaderCopy}>
         <span><TextType text={`${index} / DATA STREAM`} typingSpeed={16} /></span>
        <div className={styles.panelTitleRow}>
         <h1><TextType text={title} typingSpeed={24} initialDelay={80} /></h1>
          <CrewProfileSelector profile={profile} profiles={profiles} onChange={onProfileChange} placement="header" />
        </div>
         {description && <p>{description}</p>}
      </div>
    </header>
  );
}

function VisionReport({ profileId }: { profileId: string }) {
  const [reports, setReports] = useState<GroundReport[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setReports([]); setSelectedId(""); setMessage(""); setBusy(true);
      try {
        const member = demoCrewMappings.find((item) => item.subjectId === profileId);
        if (!member) throw new Error("Profile unavailable.");
        // Houston must use the ground-scoped report, not the astronaut's private selection.
        await selectDemoProfile("ground");
        const page = await getReports("", member.astronautId);
        if (page.items.some((item) => item.astronautId !== member.astronautId)) throw new Error("Report profile mismatch.");
        if (!cancelled) {
          setReports(page.items); setSelectedId(page.items[0]?.id ?? "");
          if (!page.items.length) setMessage("No shared report is available for this astronaut yet. Confirm a check-in to generate one.");
        }
      } catch (error) { if (!cancelled) setMessage(error instanceof Error ? error.message : "Unable to load the report."); }
      finally { if (!cancelled) setBusy(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [profileId, refresh]);
  const report = reports.find((item) => item.id === selectedId);
  return <div className={`${styles.sleepContent} ${styles.reveal}`}>
    <p className={styles.sleepNotice}>The selected astronaut&apos;s shared report uses data frozen at check-in confirmation.</p>
    <div className={styles.visionControls}>
      {reports.length > 0 && <label>Check-in <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
        {reports.map((item) => <option key={item.id} value={item.id}>{new Date(item.generatedAt).toLocaleString()} · {item.checkInId}</option>)}
      </select></label>}
      <button type="button" disabled={busy} onClick={() => setRefresh((value) => value + 1)}>{busy ? "Loading…" : "Refresh"}</button>
    </div>
    {message && <p className={styles.sleepNotice} role="alert">{message}</p>}
    {report && <div aria-live="polite">
      <p className={styles.sleepFootnote}>Check-in {report.checkInId} · generated {new Date(report.generatedAt).toLocaleString()}</p>
      <div className={styles.sleepSensorGrid}>
        {report.findings.map((finding, index) => <SpotlightCard className={styles.sleepSensor} spotlightColor="rgba(59, 26, 189, 0.12)" style={{ animationDelay: `${index * 55}ms` }} key={`${finding.source}-${index}`}><span>{finding.source}</span><p>{finding.text}</p></SpotlightCard>)}
        {!report.findings.length && <p>No shared findings.</p>}
      </div>
      {report.discrepancies.length > 0 && <><h3>Differences to review</h3><ul>{report.discrepancies.map((finding, index) => <li key={index}>{finding.text}</li>)}</ul></>}
      {report.uncertainties.length > 0 && <><h3>Limitations</h3><ul>{report.uncertainties.map((item, index) => <li key={index}>{item}</li>)}</ul></>}
      {report.humanReview.required && <p className={styles.sleepNotice}>Human review: {report.humanReview.reason}</p>}
    </div>}
  </div>;
}

function CognitiveBars({ alertness, mood, sleepQuality }: { alertness: number | null; mood: number | null; sleepQuality: number | null }) {
  const metrics = [
    { label: "Alertness", value: alertness, max: 10, note: "self-check" },
    { label: "Mood", value: mood, max: 10, note: "self-report" },
    { label: "Sleep quality", value: sleepQuality, max: 10, note: "recovery" },
  ];

  return (
     <div className={`${styles.cognitiveChart} ${styles.reveal}`}>
      <div className={styles.chartIntro}><span className={styles.chartLabel} tabIndex={0} data-tooltip="Self-reported alertness and mood, with sleep quality from the recovery observation.">COGNITIVE STATE / SELF REPORT</span></div>
      <div className={styles.barList}>
        {metrics.map((metric) => {
          const percentage = metric.value === null ? 0 : Math.min(100, (metric.value / metric.max) * 100);
          return (
            <div className={styles.barRow} key={metric.label}>
              <div className={styles.barLabel} tabIndex={0} data-tooltip={metric.note}><span>{metric.label}</span></div>
              <div className={styles.barTrack}><span className={styles.barFill} style={{ width: `${percentage}%` }} /></div>
              <strong><AnimatedValue value={metric.value} /><small> / {metric.max}</small></strong>
            </div>
          );
        })}
      </div>
      <div className={styles.scale}><span>LOW</span><span>HIGH</span></div>
    </div>
  );
}

function SleepRecovery({ profile }: { profile: DemoCrewProfile }) {
  const [analysis, setAnalysis] = useState<SleepAnalysis | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const sample = useMemo(() => {
    const end = new Date();
    const start = new Date(end.getTime() - 8 * 60 * 60 * 1000);
    return { ...profile.sleep, observation_id: `${profile.id}-demo-${end.toISOString().slice(0, 10)}`,
      period_start: start.toISOString(), period_end: end.toISOString(), observed_at: end.toISOString() };
  }, [profile]);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const end = Date.parse(sample.period_end);
      const params = new URLSearchParams({ subject: profile.id, start: new Date(end - 14 * 86400000).toISOString(), end: new Date(Date.now() + 1000).toISOString() });
      let response = await fetch(`/api/sleep-demo?${params}`, { cache: "no-store" });
      let result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load sleep data.");
      if (!result.groups.some((group: SleepAnalysis["groups"][number]) => group.series.some((point) => point.observation_id === sample.observation_id))) {
        const imported = await fetch("/api/sleep-demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify([sample]) });
        if (!imported.ok && imported.status !== 409) {
          const error = await imported.json();
          throw new Error(error.error || "Unable to import demo data.");
        }
        response = await fetch(`/api/sleep-demo?${params}`, { cache: "no-store" });
        result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to load sleep data.");
      }
      setAnalysis(result);
      setStatus(result.truncated ? "Partial results: backend limit reached." : "");
    } catch (error) {
      setAnalysis(null);
      setStatus(error instanceof Error ? error.message : "Unable to load sleep data.");
    } finally {
      setRefreshing(false);
    }
  }, [profile.id, sample]);
  useEffect(() => { void refresh(); }, [refresh]);

  async function loadDemo() {
    setBusy(true);
    try {
      const response = await fetch("/api/sleep-demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify([sample]) });
      const result = await response.json();
      if (!response.ok && response.status !== 409) throw new Error(result.error || "Unable to import demo data.");
      await refresh();
      if (response.status === 409) setStatus("Demo observation already loaded.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Unable to import demo data."); }
    finally { setBusy(false); }
  }

  const latest = analysis?.groups.flatMap((group) => group.series.map((point) => ({ ...point, device: group.device_id, method: group.method })))
    .sort((a, b) => Date.parse(b.period_end) - Date.parse(a.period_end) || b.observation_id.localeCompare(a.observation_id))[0];
  const hours = latest?.sleep_hours ?? null;
  const progress = hours === null ? 0 : Math.min(100, (hours / 8) * 100);
  const qualityColors = ["#c84242", "#df8140", "#cba033", "#81a743", "#398b54"];
  const qualityColor = qualityColors[Math.max(0, Math.min(4, Math.ceil(profile.mood.sleep_quality / 2) - 1))];
  const circumference = 2 * Math.PI * 48;
  const format = (value: number | null | undefined, unit = "") => value == null ? "—" : `${value}${unit}`;
  const metrics = [
    { label: "REM", value: format(latest?.sleep_stages?.rem_minutes, " min"), detail: latest?.sleep_stages?.method ?? "Unavailable" },
    { label: "HRV", value: format(latest?.heart_rate_variability?.value_ms, " ms"), detail: latest?.heart_rate_variability?.method ?? "Unavailable" },
    { label: "Sleep efficiency", value: format(latest?.sleep_efficiency_percent, "%"), detail: "Device estimate" },
    { label: "Awakenings", value: format(latest?.awakenings_count), detail: "Recorded count" },
    { label: "Sleep latency", value: format(latest?.sleep_latency_minutes, " min"), detail: "Device estimate" },
    { label: "Wake after sleep onset", value: format(latest?.wake_after_sleep_onset_minutes, " min"), detail: "Device estimate" },
  ];

  return (
    <div className={styles.sleepContent}>
      {status && <p className={styles.sleepNotice} role="status">{status}</p>}
      {!latest && <p className={styles.sleepNotice}>No sleep observation in the demo period. Load the sensor demo to begin.</p>}
        <div className={styles.sleepSummary}>
        <div className={styles.sleepSummaryHeading}>
          <div>
            <span className={styles.chartLabel} tabIndex={0} data-tooltip="Recorded sleep compared with an 8 hour reference window.">RECOVERY / SLEEP</span>
            <h2>Nightly recovery</h2>
          </div>
          <span className={styles.referenceTag}>REFERENCE · 8 H</span>
        </div>
        <div className={styles.sleepChart}>
          <div className={styles.sleepVisual} tabIndex={0} data-tooltip={`${hours ?? "—"} hours recorded; color: simulated self-reported sleep quality ${profile.mood.sleep_quality}/10`}>
            <svg viewBox="0 0 120 120" role="img" aria-label={`Sleep duration ${hours ?? "unavailable"} hours`}>
              <circle className={styles.ringTrack} cx="60" cy="60" r="48" />
              <circle className={styles.ringValue} cx="60" cy="60" r="48" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress / 100)} style={{ stroke: qualityColor, filter: "none" }} />
            </svg>
            <div className={styles.ringLabel}><strong><AnimatedValue value={hours} /><small> h</small></strong><span>duration</span></div>
          </div>
          <div className={styles.sleepReadout}>
            <span>RECORDED / UTC</span>
           <strong className={styles.sleepDate}>{latest ? new Date(latest.period_end).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).toUpperCase() : "—"}</strong>
           <span>{latest?.device ?? "NO OBSERVATION"}</span>
           <div className={styles.sleepActionButtons}>
             <button type="button" disabled={busy} onClick={() => void loadDemo()}>{busy ? "Loading…" : "Load sensor demo"}</button>
             <button className={`${styles.refreshButton} ${refreshing ? styles.isRefreshing : ""}`} type="button" disabled={busy || refreshing} onClick={() => void refresh()} aria-label="Refresh sleep data" title="Refresh sleep data"><RotateCcw size={15} aria-hidden="true" /></button>
           </div>
         </div>
        </div>
       </div>
       <div className={styles.sleepSensorGrid}>{metrics.map((item, index) => <SpotlightCard className={styles.sleepSensor} spotlightColor="rgba(59, 26, 189, 0.12)" key={item.label} style={{ animationDelay: `${index * 55}ms` }}><span>{item.label}</span><strong>{item.value}</strong><small>{item.detail}</small></SpotlightCard>)}</div>
    </div>
  );
}

function ReactionChart({ trials }: { trials: Trial[] }) {
  const width = 720;
  const height = 280;
  const plotTop = 18;
  const plotBottom = 232;
  const plotHeight = plotBottom - plotTop;
  const maxValue = 700;
  const x = (index: number) => trials.length > 1 ? 44 + (index / (trials.length - 1)) * (width - 66) : width / 2;
  const y = (value: number) => plotBottom - (Math.min(value, maxValue) / maxValue) * plotHeight;
  const responsePath = trials.map((trial, index) => trial.status === "response" && trial.rt_ms !== undefined ? `${index === 0 ? "M" : "L"}${x(index).toFixed(1)} ${y(trial.rt_ms).toFixed(1)}` : "").filter(Boolean).join(" ");

  return (
     <div className={`${styles.reactionChart} ${styles.reveal}`}>
      <div className={styles.chartIntro}><span className={styles.chartLabel} tabIndex={0} data-tooltip="Reaction time in milliseconds across the trial sequence. Gold marks a response at or above 500 ms.">VIGILANCE / REACTION MS</span></div>
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Reaction time trace by vigilance trial" preserveAspectRatio="xMidYMid meet">
        {[0, 250, 500, 700].map((value) => <g key={value}><line className={styles.gridLine} x1="44" x2={width - 22} y1={y(value)} y2={y(value)} /><text className={styles.axisLabel} x="0" y={y(value) + 4}>{value}</text></g>)}
        <line className={styles.thresholdLine} x1="44" x2={width - 22} y1={y(500)} y2={y(500)} />
        <text className={styles.thresholdLabel} x={width - 22} y={y(500) - 7}>500 MS</text>
        {responsePath && <path className={styles.reactionPath} d={responsePath} />}
        {trials.map((trial, index) => {
          const cx = x(index);
          if (trial.status === "response" && trial.rt_ms !== undefined) return <circle className={trial.rt_ms >= 500 ? styles.lapsePoint : styles.reactionPoint} key={`${trial.status}-${index}`} cx={cx} cy={y(trial.rt_ms)} r="5"><title>Trial {index + 1}: response in {trial.rt_ms} ms{trial.rt_ms >= 500 ? " · lapse" : ""}</title></circle>;
          return <g key={`${trial.status}-${index}`}><title>Trial {index + 1}: {trial.status === "missed" ? "missed response" : "false start"}</title><line className={trial.status === "missed" ? styles.missedMarker : styles.falseStartMarker} x1={cx - 5} x2={cx + 5} y1={plotBottom - 5} y2={plotBottom + 5} /><circle className={trial.status === "missed" ? styles.missedPoint : styles.falseStartPoint} cx={cx} cy={plotBottom} r="4" /></g>;
        })}
        {trials.map((_, index) => <text className={styles.axisLabel} key={index} x={x(index)} y={height - 10} textAnchor="middle">{index + 1}</text>)}
      </svg>
    </div>
  );
}

function TrialSummary({ responses, falseStarts, missed, lapses, medianReaction }: { responses: number; falseStarts: number; missed: number; lapses: number; medianReaction: number | null }) {
  const total = responses + falseStarts + missed;
  const segments = [{ label: "Response", value: responses, className: styles.summaryResponse }, { label: "False start", value: falseStarts, className: styles.summaryFalseStart }, { label: "Missed", value: missed, className: styles.summaryMissed }];

  return (
    <aside className={styles.trialSummary} aria-label="Vigilance summary">
      <div className={styles.summaryMetric}><span>median / ms</span><strong><AnimatedValue value={medianReaction} /></strong></div>
      <div className={styles.summaryMetric}><span>lapses / valid</span><strong><AnimatedValue value={lapses} /><small> / {responses}</small></strong></div>
      <div className={styles.distribution}><span>TRIALS / {total}</span><div className={styles.distributionTrack}>{segments.map((segment) => <span className={segment.className} style={{ width: total ? `${(segment.value / total) * 100}%` : "0%" }} key={segment.label} />)}</div>{segments.map((segment) => <div className={styles.distributionRow} key={segment.label}><span><i className={segment.className} />{segment.label.toLowerCase()}</span><strong><AnimatedValue value={segment.value} /></strong></div>)}</div>
    </aside>
  );
}

function AnimatedValue({ value }: { value: number | null }) {
  return value === null ? <>—</> : <CountUp value={String(value)} />;
}
