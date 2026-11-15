import { createHash } from "node:crypto";
import { demoCrew } from "../../examples/crew_profiles";
import { demoCrewMappings } from "../demo-crew";
import { SensorReadingSchema, type SensorWindow } from "../contracts";
import type { SensorProvider } from "../ports";
import { PythonSensorProvider } from "./python-sensors";

/**
 * Read-only demo fixture fallback. It is used only after the data service has
 * returned an explicit, untruncated MISSING result for a mapped demo profile.
 * Backend outages, stale readings and unverified mappings are never masked.
 */
export class SyntheticFallbackSensorProvider implements SensorProvider {
  constructor(private readonly primary: SensorProvider) {}

  async read(astronautId: string, window: SensorWindow) {
    const readings = await this.primary.read(astronautId, window);
    const member = demoCrewMappings.find((item) => item.astronautId === astronautId);
    const missing = readings.length === 1 ? readings[0] : undefined;
    if (!member || missing?.value !== null || missing.quality !== "UNAVAILABLE"
        || missing.provenance?.status !== "MISSING" || missing.provenance.truncated
        || missing.provenance.identityLink !== "demo_mapped" || missing.provenance.subjectId !== member.subjectId) return readings;

    const fixture = demoCrew.find((profile) => profile.id === member.subjectId)?.sleep;
    if (!fixture || fixture.synthetic !== true || fixture.subject_id !== member.subjectId) return readings;
    const digest = createHash("sha256").update(JSON.stringify(fixture)).digest("hex");
    const source = new PythonSensorProvider({ subjectId: member.subjectId, fetch: async () => Response.json({
      subject_id: member.subjectId, synthetic: true, snapshot_id: `fixture-${digest}`, as_of: null,
      truncated: false, sleep_context: { latest_measurement: fixture },
    }) });
    const fallback = await source.read(astronautId, window);
    return fallback.map((reading) => SensorReadingSchema.parse({
      ...reading,
      // A static demo fixture must not authorize an operational proposal.
      quality: reading.quality === "UNAVAILABLE" ? "UNAVAILABLE" : "DEGRADED",
      provenance: reading.provenance && { ...reading.provenance, backend: "demo_fixture" },
    }));
  }
}
