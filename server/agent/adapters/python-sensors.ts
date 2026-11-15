import { z } from "zod";
import { SensorReadingSchema, type SensorReading, type SensorWindow } from "../contracts";
import type { SensorProvider } from "../ports";
import { demoCrewMappings } from "../demo-crew";

// Local synthetic demo only. The mapping is deliberately not a verified identity.
const Measurement = z.object({
  observation_id: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/), subject_id: z.string(),
  synthetic: z.literal(true), quality: z.literal("valid"), source: z.literal("instrument"),
  observed_at: z.iso.datetime({ offset: true }), period_start: z.iso.datetime({ offset: true }),
  period_end: z.iso.datetime({ offset: true }), device_id: z.string().min(1).max(100), method: z.string().min(1).max(100),
  sleep_hours: z.number().min(0).max(24), awakenings_count: z.number().int().min(0).max(500).nullable().optional(),
  sleep_latency_minutes: z.number().min(0).max(2880).nullable().optional(),
  wake_after_sleep_onset_minutes: z.number().min(0).max(2880).nullable().optional(),
  sleep_efficiency_percent: z.number().min(0).max(100).nullable().optional(),
  sleep_stages: z.object({ device_id: z.string().min(1).max(100), method: z.enum(["eeg", "simulated_eeg"]),
    rem_minutes: z.number().min(0).max(1440) }).nullable().optional(),
  heart_rate_variability: z.object({ device_id: z.string().min(1).max(100), method: z.enum(["rmssd", "simulated_rmssd"]),
    value_ms: z.number().positive().max(1000), aggregation: z.string().min(1).max(100) }).nullable().optional(),
}).refine((value) => !value.sleep_stages || value.sleep_stages.rem_minutes <= value.sleep_hours * 60);
const Context = z.object({ subject_id: z.string(), synthetic: z.literal(true), snapshot_id: z.string().min(1).max(128), as_of: z.iso.datetime({ offset: true }).nullable(),
  truncated: z.boolean(), sleep_context: z.object({ latest_measurement: Measurement.nullable() }) });

export class PythonSensorProvider implements SensorProvider {
  private readonly fetcher: typeof fetch;
  constructor(private readonly options: { subjectId: string; fetch?: typeof fetch }) {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(options.subjectId)) throw new Error("Invalid demo subject");
    this.fetcher = options.fetch ?? fetch;
  }

  async read(astronautId: string, window: SensorWindow): Promise<SensorReading[]> {
    const member = demoCrewMappings.find((item) => item.astronautId === astronautId);
    const subjectId = astronautId === "astro-1" ? this.options.subjectId : member?.subjectId ?? this.options.subjectId;
    const base = { astronautId, observedAt: window.to, source: "sensor" as const, simulated: true,
      provenance: { backend: "aegis_data" as const, subjectId,
        identityLink: (member && subjectId === member.subjectId ? "demo_mapped" : "demo_only_unverified") as "demo_mapped" | "demo_only_unverified", snapshotId: null as string | null, backendAsOf: null as string | null, observedId: null as string | null,
        periodStart: null as string | null, periodEnd: null as string | null, deviceId: null as string | null,
        method: null as string | null, truncated: false, status: "UNAVAILABLE" as "AVAILABLE" | "MISSING" | "STALE" | "UNAVAILABLE" | "INVALID" } };
    const missing = (status: typeof base.provenance.status) => [SensorReadingSchema.parse({ ...base,
      id: "aegis-unavailable-sleep", metric: "SLEEP_DURATION", value: null, unit: "h", quality: "UNAVAILABLE",
      provenance: { ...base.provenance, status } })];
    if (!member) return missing("INVALID");
    try {
      const query = new URLSearchParams({ synthetic: "true", end: window.to });
      const backend = process.env.AEGIS_DATA_API_URL ?? "http://127.0.0.1:8000";
      const response = await this.fetcher(`${backend}/v1/subjects/${encodeURIComponent(subjectId)}/agent-context?${query}`,
        { cache: "no-store", signal: AbortSignal.timeout(5000), redirect: "error" });
      if (!response.ok) return missing("UNAVAILABLE");
      if (!response.body) return missing("INVALID");
      const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 1024 * 1024) { await reader.cancel(); return missing("INVALID"); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      let payload: unknown;
      try { payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
      catch { return missing("INVALID"); }
      const parsed = Context.safeParse(payload);
      if (!parsed.success || parsed.data.subject_id !== subjectId) return missing("INVALID");
      const data = parsed.data;
      base.provenance.snapshotId = data.snapshot_id;
      base.provenance.backendAsOf = data.as_of ? new Date(data.as_of).toISOString() : null;
      base.provenance.truncated = data.truncated;
      const reading = data.sleep_context.latest_measurement;
      if (!reading) return missing("MISSING");
      if (reading.subject_id !== subjectId) return missing("INVALID");
      const from = Date.parse(window.from), to = Date.parse(window.to);
      const start = Date.parse(reading.period_start), end = Date.parse(reading.period_end), observed = Date.parse(reading.observed_at);
      if (![from, to, start, end, observed].every(Number.isFinite) || start >= end || observed < end || observed > to) return missing("INVALID");
      base.provenance = { ...base.provenance, observedId: reading.observation_id,
        periodStart: new Date(start).toISOString(), periodEnd: new Date(end).toISOString(),
        deviceId: reading.device_id, method: reading.method, status: "AVAILABLE" };
      if (end < from || end > to) return missing("STALE");
      const common = { ...base, observedAt: new Date(observed).toISOString(), quality: (base.provenance.identityLink === "demo_mapped" && !data.truncated ? "GOOD" : "DEGRADED") as "GOOD" | "DEGRADED" };
      const result = [SensorReadingSchema.parse({ ...common, id: `${reading.observation_id}_duration`,
        metric: "SLEEP_DURATION", value: reading.sleep_hours, unit: "h" })];
      if (reading.awakenings_count != null) result.push(SensorReadingSchema.parse({ ...common,
        id: `${reading.observation_id}_awakenings`, metric: "SLEEP_INTERRUPTION_COUNT", value: reading.awakenings_count, unit: "count" }));
      if (reading.sleep_latency_minutes != null) result.push(SensorReadingSchema.parse({ ...common,
        id: `${reading.observation_id}_latency`, metric: "SLEEP_LATENCY", value: reading.sleep_latency_minutes, unit: "min" }));
      if (reading.wake_after_sleep_onset_minutes != null) result.push(SensorReadingSchema.parse({ ...common,
        id: `${reading.observation_id}_wake`, metric: "WAKE_AFTER_SLEEP_ONSET", value: reading.wake_after_sleep_onset_minutes, unit: "min" }));
      if (reading.sleep_efficiency_percent != null) result.push(SensorReadingSchema.parse({ ...common,
        id: `${reading.observation_id}_efficiency`, metric: "SLEEP_EFFICIENCY", value: reading.sleep_efficiency_percent, unit: "%" }));
      if (reading.sleep_stages) result.push(SensorReadingSchema.parse({ ...common,
        provenance: { ...common.provenance, deviceId: reading.sleep_stages.device_id, method: reading.sleep_stages.method },
        id: `${reading.observation_id}_rem`, metric: "REM_DURATION", value: reading.sleep_stages.rem_minutes, unit: "min" }));
      if (reading.heart_rate_variability) result.push(SensorReadingSchema.parse({ ...common,
        provenance: { ...common.provenance, deviceId: reading.heart_rate_variability.device_id,
          method: reading.heart_rate_variability.method, aggregation: reading.heart_rate_variability.aggregation },
        id: `${reading.observation_id}_hrv`, metric: "HEART_RATE_VARIABILITY", value: reading.heart_rate_variability.value_ms, unit: "ms" }));
      return result;
    } catch { return missing("UNAVAILABLE"); }
  }
}
