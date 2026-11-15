"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import demoObservations from "@/server/examples/synthetic.json";
import { CountUp } from "@/components/reactbits/CountUp";
import styles from "./CrewDataDashboard.module.css";

type Trial = { status: "response" | "false_start" | "missed"; rt_ms?: number };
type Observation =
  | { kind: "sleep"; subject_id: string; observed_at: string; synthetic: boolean; sleep_hours: number; sleep_quality: number }
  | { kind: "mood"; subject_id: string; observed_at: string; synthetic: boolean; confirmed: boolean; mood_rating: number; alertness: number }
  | { kind: "vigilance"; subject_id: string; observed_at: string; synthetic: boolean; device_id: string; trials: Trial[] };
type VigilanceObservation = Extract<Observation, { kind: "vigilance" }>;
type DataView = "cognitive" | "sleep" | "vigilance";

const observations = demoObservations as unknown as Observation[];
const latest = <T extends Observation["kind"]>(kind: T) => [...observations].reverse().find((item) => item.kind === kind) as Extract<Observation, { kind: T }> | undefined;

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
}

export function CrewDataDashboard({ onBack }: { onBack: () => void }) {
  const [activeView, setActiveView] = useState<DataView>("cognitive");
  const sleep = latest("sleep") as Extract<Observation, { kind: "sleep" }> | undefined;
  const mood = latest("mood") as Extract<Observation, { kind: "mood" }> | undefined;
  const vigilance = latest("vigilance") as VigilanceObservation | undefined;
  const responses = vigilance?.trials.filter((trial) => trial.status === "response" && trial.rt_ms !== undefined && trial.rt_ms >= 100).map((trial) => trial.rt_ms as number) ?? [];
  const falseStarts = vigilance?.trials.filter((trial) => trial.status === "false_start" || (trial.status === "response" && trial.rt_ms !== undefined && trial.rt_ms < 100)).length ?? 0;
  const missed = vigilance?.trials.filter((trial) => trial.status === "missed").length ?? 0;
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
          </nav>
          <div className={styles.sidebarFooter}>3 ACTIVE STREAMS</div>
        </aside>

        <main className={styles.dataPanel}>
          {activeView === "cognitive" && <DataPanelHeader index="01" title="Cognitive state" description="Alertness, mood and recovery quality" />}
          {activeView === "sleep" && <DataPanelHeader index="02" title="Sleep recovery" description="Recorded duration against an 8 hour reference" />}
          {activeView === "vigilance" && <DataPanelHeader index="03" title="Vigilance test" description={`${responses.length} valid responses · ${vigilance?.trials.length ?? 0} total trials`} />}
          <div className={styles.panelContent}>
            {activeView === "cognitive" && <CognitiveBars alertness={mood?.alertness ?? null} mood={mood?.mood_rating ?? null} sleepQuality={sleep?.sleep_quality ?? null} />}
            {activeView === "sleep" && <SleepRecovery hours={sleep?.sleep_hours ?? null} quality={sleep?.sleep_quality ?? null} />}
            {activeView === "vigilance" && <div className={styles.vigilanceLayout}><ReactionChart trials={vigilance?.trials ?? []} /><TrialSummary responses={responses.length} falseStarts={falseStarts} missed={missed} lapses={lapses} medianReaction={median(responses)} /></div>}
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

function CognitiveBars({ alertness, mood, sleepQuality }: { alertness: number | null; mood: number | null; sleepQuality: number | null }) {
  const metrics = [
    { label: "Alertness", value: alertness, max: 10, note: "self-check" },
    { label: "Mood", value: mood, max: 10, note: "self-report" },
    { label: "Sleep quality", value: sleepQuality, max: 10, note: "recovery" },
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

function SleepRecovery({ hours, quality }: { hours: number | null; quality: number | null }) {
  const progress = hours === null ? 0 : Math.min(100, (hours / 8) * 100);
  const circumference = 2 * Math.PI * 48;

  return (
    <div className={styles.sleepChart}>
      <div className={styles.chartIntro}><span className={styles.chartLabel} tabIndex={0} data-tooltip="Recorded sleep compared with an 8 hour reference window.">RECOVERY / SLEEP</span></div>
      <div className={styles.sleepVisual} tabIndex={0} data-tooltip={`${hours ?? "—"} hours recorded · quality ${quality ?? "—"} / 10`}>
        <svg viewBox="0 0 120 120" role="img" aria-label={`Sleep duration ${hours ?? "unavailable"} hours`}>
          <circle className={styles.ringTrack} cx="60" cy="60" r="48" />
          <circle className={styles.ringValue} cx="60" cy="60" r="48" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress / 100)} />
        </svg>
        <div className={styles.ringLabel}><strong><AnimatedValue value={hours} /><small> h</small></strong><span>duration</span></div>
      </div>
      <div className={styles.sleepReadout} data-tooltip="Self-reported sleep quality on a ten point scale." tabIndex={0}><span>quality / 10</span><strong><AnimatedValue value={quality} /></strong></div>
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
