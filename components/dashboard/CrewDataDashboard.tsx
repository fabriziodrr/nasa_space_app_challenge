"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { demoCrew, type DemoCrewProfile } from "@/server/examples/crew_profiles";
import { CountUp } from "@/components/reactbits/CountUp";
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
            <button className={styles.backButton} type="button" onClick={onBack}>
              <ArrowLeft size={15} aria-hidden="true" />
              <span>Dashboard</span>
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

        <main className={styles.dataPanel}>
          <div className={styles.crewSelector}><label htmlFor="demo-crew">CREW PROFILE / SYNTHETIC DEMO</label><select id="demo-crew" value={profile.id} onChange={(event) => setProfileId(event.target.value)}>{demoCrew.map((member) => <option key={member.id} value={member.id}>{member.name} · {member.role}</option>)}</select><span>{profile.id} · fictional profile</span></div>
          {activeView === "cognitive" && <DataPanelHeader index="01" title="Cognitive state" description={`Fictional self-report · ${mood.observed_at}`} />}
          {activeView === "sleep" && <DataPanelHeader index="02" title="Sleep recovery" description="Synthetic sensor data · demonstration" />}
          {activeView === "vigilance" && <DataPanelHeader index="03" title="Vigilance test" description={`${responses.length} valid responses · ${trials.length} total trials · synthetic demo`} />}
          {activeView === "vision" && <DataPanelHeader index="04" title="Vision report" description="Selected vision session and data agent context" />}
          <div className={styles.panelContent}>
            {activeView === "cognitive" && <CognitiveBars alertness={mood.alertness} mood={mood.mood_rating} sleepQuality={mood.sleep_quality} />}
            {activeView === "sleep" && <SleepRecovery key={profile.id} profile={profile} />}
            {activeView === "vigilance" && <div className={styles.vigilanceLayout}><ReactionChart trials={trials} /><TrialSummary responses={responses.length} falseStarts={falseStarts} missed={missed} lapses={lapses} medianReaction={median(responses)} /></div>}
            {activeView === "vision" && <VisionReport />}
          </div>
        </main>
      </div>

    </section>
  );
}

function DataViewButton({ active, index, label, detail, onClick }: { active: boolean; index: string; label: string; detail: string; onClick: () => void }) {
  return <button className={`${styles.sidebarButton} ${active ? styles.sidebarButtonActive : ""}`} type="button" aria-pressed={active} onClick={onClick}><span className={styles.sidebarIndex}>{index}</span><span className={styles.sidebarButtonCopy}><strong>{label}</strong><small>{detail}</small></span><span className={styles.sidebarArrow} aria-hidden="true">↗</span></button>;
}

function DataPanelHeader({ index, title, description }: { index: string; title: string; description: string }) {
  return <header className={styles.panelHeader}><span>{index} / DATA STREAM</span><h1>{title}</h1><p>{description}</p></header>;
}

type VisionDataReport = { schema_version: string; sleep: { observation: { sleep_hours: number } | null }; reported_state: { observation: { fatigue_rating: number | null } | null }; vision: { status: string; observation: { source: string; usability: string; coverage: number | null; closureFraction: number | null; reasons: string[] } | null } };

function VisionReport() {
  const [session, setSession] = useState("");
  const [token, setToken] = useState("");
  const [report, setReport] = useState<VisionDataReport | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function load(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setReport(null); setMessage("");
    try {
      const response = await fetch("/api/demo-data-agent", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ vision_session_id: session }), cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 401 ? "Token demo non riconosciuto." : "Rapporto non disponibile: verifica sessione e servizi locali.");
      const result: VisionDataReport = await response.json();
      if (result.schema_version !== "data-agent-demo-1") throw new Error("Formato del rapporto non riconosciuto.");
      setReport(result);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Errore nel caricamento."); }
    finally { setBusy(false); }
  }
  const eye = report?.vision.observation;
  return <div className={styles.sleepContent}>
    <p className={styles.sleepNotice}>The selected crew profile is not linked to this vision session or the agent&apos;s fixed sleep subject.</p>
    <form className={styles.visionControls} onSubmit={(event) => void load(event)}>
      <label>Vision session<input value={session} onChange={(event) => setSession(event.target.value)} required /></label>
      <label>Demo token<input value={token} onChange={(event) => setToken(event.target.value)} type="password" autoComplete="off" required /></label>
      <button type="submit" disabled={busy}>Load report</button>
    </form>
    {message && <p className={styles.sleepNotice} role="alert">{message}</p>}
    {report && <><div className={styles.sleepSensorGrid} aria-live="polite">
      {[{ label: "Synthetic sleep", value: report.sleep.observation ? `${report.sleep.observation.sleep_hours} h` : "—" }, { label: "Reported fatigue", value: report.reported_state.observation?.fatigue_rating != null ? `${report.reported_state.observation.fatigue_rating} / 10` : "—" }, { label: "Vision quality", value: eye?.usability ?? report.vision.status }, { label: "Vision coverage", value: eye?.coverage != null ? `${(eye.coverage * 100).toFixed(1)}%` : "—" }, { label: "Eye closure fraction", value: eye?.closureFraction != null ? `${(eye.closureFraction * 100).toFixed(1)}%` : "—" }, { label: "Vision source", value: eye?.source ?? "—" }].map((item) => <div className={styles.sleepSensor} key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>)}
    </div><p className={styles.sleepFootnote}>Sleep data are simulated. Identities are not linked; observations do not constitute a diagnosis.{eye?.reasons?.length ? ` Vision limits: ${eye.reasons.join(", ")}.` : ""}</p></>}
  </div>;
}

function CognitiveBars({ alertness, mood, sleepQuality }: { alertness: number | null; mood: number | null; sleepQuality: number | null }) {
  const metrics = [
    { label: "Alertness", value: alertness, max: 10, note: "self-check" },
    { label: "Mood", value: mood, max: 5, note: "self-report" },
    { label: "Sleep quality", value: sleepQuality, max: 5, note: "recovery" },
  ];

  return (
        <div className={styles.cognitiveChart}>
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
  const refresh = useCallback(async () => {
    try {
      const params = new URLSearchParams({ subject: profile.id, start: "2026-11-01T00:00:00Z", end: "2026-11-16T00:00:00Z" });
      let response = await fetch(`/api/sleep-demo?${params}`, { cache: "no-store" });
      let result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load sleep data.");
      if (!result.groups.some((group: SleepAnalysis["groups"][number]) => group.series.some((point) => point.observation_id === profile.sleep.observation_id))) {
        const imported = await fetch("/api/sleep-demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify([profile.sleep]) });
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
    }
  }, [profile.id, profile.sleep]);
  useEffect(() => { void refresh(); }, [refresh]);

  async function loadDemo() {
    setBusy(true);
    try {
      const response = await fetch("/api/sleep-demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify([profile.sleep]) });
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
  const qualityColor = qualityColors[Math.max(0, Math.min(4, Math.round(profile.mood.sleep_quality) - 1))];
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
      <div className={styles.sleepActions}><span>SYNTHETIC DEMO · {profile.id}</span><button type="button" disabled={busy} onClick={() => void loadDemo()}>Load sensor demo</button><button type="button" onClick={() => void refresh()}>Refresh</button></div>
      {status && <p className={styles.sleepNotice} role="status">{status}</p>}
      {!latest && <p className={styles.sleepNotice}>No sleep observation in the demo period. Load the sensor demo to begin.</p>}
      <div className={styles.sleepChart}>
      <div className={styles.chartIntro}><span className={styles.chartLabel} tabIndex={0} data-tooltip="Recorded sleep compared with an 8 hour reference window.">RECOVERY / SLEEP</span></div>
      <div className={styles.sleepVisual} tabIndex={0} data-tooltip={`${hours ?? "—"} hours recorded; color: simulated self-reported sleep quality ${profile.mood.sleep_quality}/5`}>
        <svg viewBox="0 0 120 120" role="img" aria-label={`Sleep duration ${hours ?? "unavailable"} hours`}>
          <circle className={styles.ringTrack} cx="60" cy="60" r="48" />
          <circle className={styles.ringValue} cx="60" cy="60" r="48" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress / 100)} style={{ stroke: qualityColor, filter: "none" }} />
        </svg>
        <div className={styles.ringLabel}><strong><AnimatedValue value={hours} /><small> h</small></strong><span>duration</span></div>
      </div>
      <div className={styles.sleepReadout}><span>recorded / UTC</span><strong className={styles.sleepDate}>{latest ? latest.period_end.slice(0, 10) : "—"}</strong><span>{latest?.device ?? "NO OBSERVATION"}</span></div>
      </div>
      <div className={styles.sleepSensorGrid}>{metrics.map((item) => <div className={styles.sleepSensor} key={item.label}><span>{item.label}</span><strong>{item.value}</strong><small>{item.detail}</small></div>)}</div>
      <p className={styles.sleepFootnote}>Ring length: hours slept relative to the demo reference of 8 h. Color: simulated self-reported sleep quality ({profile.mood.sleep_quality}/5), not sensor-derived. Simulated measurements, not NASA data. Vision is a separate measurement; no diagnosis.</p>
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
    <div className={styles.reactionChart}>
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
