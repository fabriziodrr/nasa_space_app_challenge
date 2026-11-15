import type { PsychProfile } from "../../app/sloth-demo/fake-history";
import styles from "./psychological-profile.module.css";

function Trend({ label, values, max }: { label: string; values: number[]; max: number }) {
  return (
    <div className={styles.trend}>
      <div className={styles.trendLabel}>{label}</div>
      <div className={styles.bars} aria-hidden="true">
        {values.map((value, index) => (
          <span key={index} className={styles.bar} style={{ height: `${Math.max(8, (value / max) * 100)}%` }} />
        ))}
      </div>
    </div>
  );
}

export function PsychologicalProfile({ profile }: { profile: PsychProfile }) {
  return (
    <div className={styles.panel}>
      <h3 className={styles.title}>Psychological profile</h3>
      <p className={styles.subtitle}>Longitudinal simulation (demo) — not a clinical assessment.</p>

      <div className={styles.trends}>
        <Trend label="Sleep quality" values={profile.sleepQuality} max={5} />
        <Trend label="Fatigue" values={profile.fatigue} max={5} />
        <Trend label="Presence" values={profile.presence} max={10} />
      </div>
      <div className={styles.days} aria-hidden="true">
        {profile.labels.map((label) => <span key={label}>{label.replace("Day ", "D")}</span>)}
      </div>

      <ul className={styles.signals}>
        {profile.signals.map((signal) => (
          <li key={signal.label} className={styles.signal}>
            <span className={`${styles.badge} ${styles[signal.level]}`}>{signal.level === "ok" ? "OK" : signal.level === "watch" ? "WATCH" : "ATTENTION"}</span>
            <div>
              <strong>{signal.label}</strong>
              <p>{signal.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
