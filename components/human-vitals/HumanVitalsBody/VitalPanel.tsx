import { RotateCcw, X } from "lucide-react";
import { CountUp } from "@/components/reactbits/CountUp";
import { SpotlightCard } from "@/components/reactbits/SpotlightCard";
import type { VitalMetric, VitalVisualization, VitalZone } from "./types";
import styles from "./HumanVitalsBody.module.css";

export function VitalPanel({ zone, closing, onClose, onReset }: { zone: VitalZone; closing: boolean; onClose: () => void; onReset: () => void }) {
  const state = zone.metrics.some((metric) => metric.status === "critical")
    ? "critical"
    : zone.metrics.some((metric) => metric.status === "attention")
      ? "attention"
      : "normal";

  return (
    <SpotlightCard className={`${styles["vitals-panel"]} ${closing ? styles["panel-closing"] : styles["panel-opening"]}`} spotlightColor="rgba(59, 26, 189, 0.13)" style={{ "--accent": zone.color } as React.CSSProperties} role="dialog" aria-label={`${zone.label} vital data`}>
      <div className={styles["panel-topline"]}>
        <div className={styles["panel-title-row"]}>
          <div className={styles["zone-status-dot"]} data-status={state} />
          <div>
            <h2>{zone.label}</h2>
            <span className={styles["zone-path"]}>SYNTHETIC DEMO / {zone.shortLabel.toUpperCase()}</span>
          </div>
        </div>
        <div className={styles["panel-actions"]}>
          <button className={styles["icon-button"]} onClick={onReset} aria-label="Reset body view" title="Reset view"><RotateCcw size={15} /></button>
          <button className={styles["icon-button"]} onClick={onClose} aria-label="Close vital data" title="Close"><X size={15} /></button>
        </div>
      </div>

      <div className={styles["panel-content"]} key={zone.id}>
      <p className={styles["panel-description"]}>{zone.description}</p>

      {zone.visualization && <SignalChart visualization={zone.visualization} />}

      <div className={styles["metric-list"]}>
        {zone.metrics.map((metric) => <MetricRow key={`${metric.label}-${metric.value}`} metric={metric} />)}
      </div>

       </div>
    </SpotlightCard>
  );
}

function SignalChart({ visualization }: { visualization: VitalVisualization }) {
  const isEcg = visualization.type === "ecg";
  const isRespiration = visualization.type === "respiration";
  const ecgPath = createEcgPath();
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
        {isEcg ? (
          <g className={styles["signal-track"]}>
            <path className={styles["signal-glow"]} d={ecgPath} />
            <path className={styles["signal-line"]} d={ecgPath} />
          </g>
        ) : isRespiration ? (
          <g className={`${styles["signal-track"]} ${styles["signal-track-respiration"]}`}>
            <g>
              <path className={styles["signal-glow"]} d={path} />
              <path className={styles["signal-line"]} d={path} />
            </g>
            <g transform="translate(320 0)">
              <path className={styles["signal-glow"]} d={path} />
              <path className={styles["signal-line"]} d={path} />
            </g>
          </g>
        ) : (
          <>
            <path className={styles["signal-glow"]} d={path} pathLength="1" />
            <path className={styles["signal-line"]} d={path} pathLength="1" />
          </>
        )}
      </svg>
    </div>
  );
}

function createEcgPath() {
  const width = 640;
  const cycleWidth = 160;
  const baseline = 48;
  const points: string[] = [];

  for (let x = 0; x <= width; x += 2) {
    const phase = (x % cycleWidth) / cycleWidth;
    const pWave = 4.2 * Math.exp(-((phase - 0.18) ** 2) / 0.0018);
    const qWave = -7 * Math.exp(-((phase - 0.295) ** 2) / 0.00045);
    const rWave = 34 * Math.exp(-((phase - 0.32) ** 2) / 0.00022);
    const sWave = -15 * Math.exp(-((phase - 0.352) ** 2) / 0.00055);
    const tWave = 9 * Math.exp(-((phase - 0.56) ** 2) / 0.008);
    const baselineDrift = Math.sin(phase * Math.PI * 2) * 0.45;
    const y = baseline - pWave - qWave - rWave - sWave - tWave + baselineDrift;
    points.push(`${x === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`);
  }

  return points.join(" ");
}

function MetricRow({ metric }: { metric: VitalMetric }) {
  return (
    <div className={styles["metric-row"]}>
      <span className={styles["metric-label"]}>{metric.label}</span>
      <span className={`${styles["metric-value"]} ${styles[`metric-${metric.status ?? "neutral"}`]}`}>
        <CountUp value={metric.value} /> <small>{metric.unit}</small>
      </span>
    </div>
  );
}
