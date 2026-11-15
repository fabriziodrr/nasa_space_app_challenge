import type { Finding, OperationalContext } from "../contracts";

const labels: Record<string, string> = { SLEEP_HOURS: "Sleep duration", SLEEP_DURATION: "Sleep duration", FATIGUE: "Fatigue", SLEEP_QUALITY: "Sleep quality", PHYSICAL_NOTES: "Physical condition", MENTAL_STATE: "Mental state", STRESSOR_NOTES: "Stressors", SLEEP_INTERRUPTION_COUNT: "Awakenings", SLEEP_LATENCY: "Sleep latency", WAKE_AFTER_SLEEP_ONSET: "Time awake after sleep onset", SLEEP_EFFICIENCY: "Sleep efficiency", REM_DURATION: "REM duration", HEART_RATE_VARIABILITY: "Heart rate variability", RESTING_HEART_RATE: "Resting heart rate" };
export function withReportMeasurements(finding: Finding, context: OperationalContext): Finding {
  const measurements: NonNullable<Finding["measurements"]> = [];
  if (finding.source !== "inference") for (const ref of finding.evidence) {
    if (ref.source === "self_report") {
      const item = context.checkIn.observations.find((o) => o.id === ref.observationId);
      if (item) measurements.push({ label: labels[item.field] ?? "Reported condition", value: item.value, unit: item.field === "SLEEP_HOURS" ? "h" : "scaleMax" in item && item.scaleMax ? `/ ${item.scaleMax}` : "", observedAt: item.recordedAt, simulated: false });
    } else if (ref.source === "sensor") {
      const item = context.sensors.find((o) => o.id === ref.sensorReadingId);
      if (item && item.value !== null) measurements.push({ label: labels[item.metric] ?? "Measurement", value: item.value, unit: item.unit, observedAt: item.observedAt, simulated: item.simulated });
    } else if (context.vision?.id === ref.visionObservationId) {
      const eye = context.vision;
      if (eye.coverage !== null) measurements.push({ label: "Valid coverage", value: Math.round(eye.coverage * 1000) / 10, unit: "%", observedAt: eye.endedAt, simulated: eye.source === "synthetic" });
      if (eye.closureFraction !== null) measurements.push({ label: "Eye closure fraction", value: Math.round(eye.closureFraction * 1000) / 10, unit: "%", observedAt: eye.endedAt, simulated: eye.source === "synthetic" });
    }
  }
  return { ...finding, measurements };
}
