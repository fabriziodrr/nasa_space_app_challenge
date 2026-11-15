import type { Finding, OperationalContext } from "../contracts";

/** A factual cross-reference, not a fatigue classifier or a causal conclusion. */
export function crossSourceSummary(context: OperationalContext): Finding | null {
  const eye = context.vision;
  if (!eye || eye.source !== "webcam" || eye.usability !== "USABLE") return null;
  const reported = context.checkIn.observations.filter((item) =>
    item.field === "SLEEP_HOURS" || ((item.field === "FATIGUE" || item.field === "SLEEP_QUALITY") && item.scaleMax === 10));
  const sleep = context.sensors.find((item) => item.metric === "SLEEP_DURATION" && item.value !== null && item.quality === "GOOD"
    && item.provenance?.identityLink === "demo_mapped" && item.provenance.status === "AVAILABLE" && !item.provenance.truncated);
  if (!reported.length || !sleep) return null;
  const statements = reported.map((item) => `${item.field} ${item.value}${item.field === "SLEEP_HOURS" ? " h" : "/10"} (reported ${item.recordedAt})`).join("; ");
  return {
    source: "inference",
    text: `Cross-source context: ${statements}. ${sleep.simulated ? "Simulated" : "Sensor"} sleep duration ${sleep.value} h, period ${sleep.provenance?.periodStart} to ${sleep.provenance?.periodEnd}. `
      + `Webcam eyelid observation ${eye.startedAt} to ${eye.endedAt}: ${eye.validMs / 1000} s valid time, coverage ${eye.coverage === null ? "unavailable" : (eye.coverage * 100).toFixed(1) + "%"}, closure fraction ${eye.closureFraction === null ? "unavailable" : (eye.closureFraction * 100).toFixed(1) + "%"}. `
      + "These observations cover different measurement periods and quantities. Their co-presence does not establish agreement, contradiction, causation or a fatigue diagnosis.",
    evidence: [
      ...reported.map((item) => ({ source: "self_report" as const, observationId: item.id })),
      { source: "sensor", sensorReadingId: sleep.id }, { source: "vision", visionObservationId: eye.id },
    ],
  };
}
