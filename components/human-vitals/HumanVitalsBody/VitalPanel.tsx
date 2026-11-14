import { Activity, CircleHelp, Radio, RotateCcw, ShieldCheck, X } from "lucide-react";
import type { VitalMetric, VitalSource, VitalStatus, VitalVisualization, VitalZone } from "./types";
import styles from "./HumanVitalsBody.module.css";

const sourceLabels: Record<VitalSource, string> = {
  "synthetic-demo": "Synthetic demo",
  "self-reported": "Self-reported",
  "measured-in-app": "Measured in app",
};

const statusLabels: Record<VitalStatus, string> = {
  normal: "Stable",
  attention: "Review",
  critical: "Critical",
  neutral: "Recorded",
};

export function VitalPanel({ zone, closing, onClose, onReset }: { zone: VitalZone; closing: boolean; onClose: () => void; onReset: () => void }) {
  const state = zone.metrics.some((metric) => metric.status === "critical")
    ? "critical"
    : zone.metrics.some((metric) => metric.status === "attention")
      ? "attention"
      : "normal";

  return (
    <aside className={`${styles["vitals-panel"]} ${closing ? styles["panel-closing"] : styles["panel-opening"]}`} style={{ "--accent": zone.color } as React.CSSProperties} role="dialog" aria-label={`${zone.label} vital data`}>
      <div className={styles["panel-topline"]}>
        <span className={styles["panel-kicker"]}><Activity size={14} /> SYNTHETIC BODY MAP</span>
        <div className={styles["panel-actions"]}>
          <button className={styles["icon-button"]} onClick={onReset} aria-label="Reset body view" title="Reset view"><RotateCcw size={15} /></button>
          <button className={styles["icon-button"]} onClick={onClose} aria-label="Close vital data" title="Close"><X size={15} /></button>
        </div>
      </div>

      <div className={styles["panel-content"]} key={zone.id}>
      <div className={styles["panel-title-row"]}>
        <div className={styles["zone-status-dot"]} data-status={state} />
        <div>
          <h2>{zone.label}</h2>
          <span className={styles["zone-path"]}>BODY ZONE / {zone.shortLabel.toUpperCase()}</span>
        </div>
      </div>

      <p className={styles["panel-description"]}>{zone.description}</p>

      {zone.visualization && <SignalChart visualization={zone.visualization} />}

      <div className={styles["metric-list"]}>
        {zone.metrics.map((metric) => <MetricRow key={`${metric.label}-${metric.value}`} metric={metric} />)}
      </div>

      <div className={styles["panel-footer"]}>
        <span className={styles["data-source"]}><Radio size={13} /> {sourceLabels[zone.metrics[0]?.source ?? "synthetic-demo"]}</span>
        <span className={`${styles["status-copy"]} ${styles[`status-${state}`]}`}><ShieldCheck size={13} /> {statusLabels[state]}</span>
      </div>

      <div className={styles["panel-note"]}>
        <CircleHelp size={14} />
        <span>Demo readings for interface exploration. They are not medical measurements.</span>
      </div>
      </div>
    </aside>
  );
}

function SignalChart({ visualization }: { visualization: VitalVisualization }) {
  const path = visualization.waveform
    .map((value, index, values) => {
      const x = (index / (values.length - 1)) * 320;
      const y = 12 + (1 - value) * 72;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div className={styles["signal-card"]}>
      <div className={styles["signal-heading"]}>
        <span><span className={styles["signal-live"]} /> {visualization.label}</span>
        <span className={styles["signal-meta"]}>{visualization.type === "ecg" ? "LEAD II" : "FLOW / VOLUME"}</span>
      </div>
      <svg className={styles["signal-chart"]} viewBox="0 0 320 96" role="img" aria-label={`${visualization.label}, synthetic waveform`} preserveAspectRatio="none">
        <path className={styles["signal-grid"]} d="M0 24H320 M0 48H320 M0 72H320 M40 0V96 M80 0V96 M120 0V96 M160 0V96 M200 0V96 M240 0V96 M280 0V96" />
        <path className={styles["signal-glow"]} d={path} pathLength="1" />
        <path className={styles["signal-line"]} d={path} pathLength="1" />
      </svg>
      <span className={styles["signal-caption"]}>SYNTHETIC DEMO SIGNAL · LIVE PREVIEW</span>
    </div>
  );
}

function MetricRow({ metric }: { metric: VitalMetric }) {
  return (
    <div className={styles["metric-row"]}>
      <span className={styles["metric-label"]}>{metric.label}</span>
      <span className={`${styles["metric-value"]} ${styles[`metric-${metric.status ?? "neutral"}`]}`}>
        {metric.value} <small>{metric.unit}</small>
      </span>
    </div>
  );
}
