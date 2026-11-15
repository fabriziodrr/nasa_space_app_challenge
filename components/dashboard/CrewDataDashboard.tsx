"use client";

import demoObservations from "@/server/examples/synthetic.json";
import styles from "./CrewDataDashboard.module.css";

type Trial = { status: "response" | "false_start" | "missed"; rt_ms?: number };
type Observation =
  | { kind: "sleep"; subject_id: string; observed_at: string; synthetic: boolean; sleep_hours: number; sleep_quality: number }
  | { kind: "mood"; subject_id: string; observed_at: string; synthetic: boolean; confirmed: boolean; mood_rating: number; alertness: number }
  | { kind: "vigilance"; subject_id: string; observed_at: string; synthetic: boolean; device_id: string; trials: Trial[] };
type VigilanceObservation = Extract<Observation, { kind: "vigilance" }>;

const observations = demoObservations as unknown as Observation[];
const latest = <T extends Observation["kind"]>(kind: T) => [...observations].reverse().find((item) => item.kind === kind) as Extract<Observation, { kind: T }> | undefined;

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
}

export function CrewDataDashboard() {
  const sleep = latest("sleep") as Extract<Observation, { kind: "sleep" }> | undefined;
  const mood = latest("mood") as Extract<Observation, { kind: "mood" }> | undefined;
  const vigilance = latest("vigilance") as VigilanceObservation | undefined;
  const responses = vigilance?.trials.filter((trial) => trial.status === "response" && trial.rt_ms !== undefined && trial.rt_ms >= 100).map((trial) => trial.rt_ms as number) ?? [];
  const falseStarts = vigilance?.trials.filter((trial) => trial.status === "false_start" || (trial.status === "response" && trial.rt_ms !== undefined && trial.rt_ms < 100)).length ?? 0;
  const missed = vigilance?.trials.filter((trial) => trial.status === "missed").length ?? 0;
  const lapses = responses.filter((value) => value >= 500).length;

  return (
    <section className={styles.workspace} aria-labelledby="crew-data-title">
      <header className={styles.header}>
        <div>
          <span className={styles.kicker}>HOUSTON / CREW DATA</span>
          <h1 id="crew-data-title">Crew readiness</h1>
          <p>Operational context assembled from the selected synthetic JSON observations.</p>
        </div>
        <div className={styles.provenance}><span><i /> Synthetic data</span><small>demo-astronaut · 14 Nov 2026 · 07:10 UTC</small></div>
      </header>

      <section className={styles.section} aria-labelledby="readiness-heading">
        <div className={styles.sectionHeading}><span className={styles.kicker}>READINESS</span><h2 id="readiness-heading">Cognitive state</h2></div>
        <div className={styles.cards}>
          <DataCard label="Alertness" value={mood?.alertness ?? null} unit="/ 10" meta="Confirmed self-check" />
          <DataCard label="Mood" value={mood?.mood_rating ?? null} unit="/ 5" meta="Confirmed self-report" />
          <DataCard label="Median reaction" value={median(responses)} unit="ms" meta={`${responses.length} valid responses`} />
        </div>
      </section>

      <div className={styles.lowerGrid}>
        <section className={styles.section} aria-labelledby="recovery-heading">
          <div className={styles.sectionHeading}><span className={styles.kicker}>RECOVERY</span><h2 id="recovery-heading">Sleep context</h2></div>
          <div className={styles.recoveryCard}><div><span>Sleep duration</span><strong>{sleep?.sleep_hours ?? "—"}<small> h</small></strong></div><div><span>Sleep quality</span><strong>{sleep?.sleep_quality ?? "—"}<small> / 5</small></strong></div></div>
          <p className={styles.note}>The JSON contains recovery and self-reported state data. It does not represent a localized anatomical measurement.</p>
        </section>
        <section className={styles.section} aria-labelledby="vigilance-heading">
          <div className={styles.sectionHeading}><span className={styles.kicker}>VIGILANCE</span><h2 id="vigilance-heading">Trial profile</h2></div>
          <div className={styles.trialGrid}><DataCard label="False starts" value={falseStarts} meta="Demo protocol" /><DataCard label="Missed trials" value={missed} meta="No response" /><DataCard label="Lapses" value={lapses} meta="Response ≥ 500 ms" /></div>
        </section>
      </div>
    </section>
  );
}

function DataCard({ label, value, unit, meta }: { label: string; value: number | null; unit?: string; meta: string }) {
  return <article className={styles.card}><span>{label}</span><strong>{value ?? "—"}{value !== null && unit ? <small> {unit}</small> : null}</strong><em>{meta}</em></article>;
}
