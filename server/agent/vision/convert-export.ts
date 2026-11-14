import { z } from "zod";
import { VisionObservationSchema, type VisionObservation } from "../contracts";
import { AgentError } from "../core/errors";
import { evaluateVisionQuality, type VisionQualityConfig } from "./quality";

// This schema checks the fields used by the mapper. It does not replace the
// producer's parser and temporal replay, which must run first in an isolated worker.
const MappableExport = z.object({
  schemaVersion: z.literal("crewready-session-v2"), contractVersion: z.literal("c01-v2"),
  exportedAt: z.string().datetime({ offset: true }),
  source: z.object({ kind: z.enum(["webcam", "synthetic"]) }),
  timeOriginUnixMs: z.number().finite().nullable(),
  application: z.object({ interruption: VisionObservationSchema.shape.interruption }).nullable(),
  snapshot: z.object({
    engineVersion: z.string(), config: z.object({ configId: z.string() }), calibrationIds: z.array(z.string()),
    session: z.object({ startMs: z.number().finite().nullable(), endMs: z.number().finite().nullable(),
      elapsedMs: z.number().finite().nonnegative(), validMs: z.number().finite().nonnegative(),
      coverage: z.number().finite().nullable(), closureFraction: z.number().finite().nullable(),
      closures: z.object({ completeCount: z.number().int().nonnegative(), incompleteCount: z.number().int().nonnegative(),
        prolongedCount: z.number().int().nonnegative(), longestCompleteMs: z.number().finite().nonnegative().nullable() }),
    }),
  }),
});

/** Map an already replay-validated export; never call on a merely parsed upload. */
export function convertValidatedVisionExport(input: unknown, assigned: {
  id: string; astronautId: string; sessionId: string; sha256: string; importedAt: Date; quality: VisionQualityConfig;
}): VisionObservation {
  const result = MappableExport.safeParse(input);
  if (!result.success) throw new AgentError("VALIDATION_ERROR", "Riepilogo della sessione non valido.");
  const data = result.data; const scope = data.snapshot.session;
  const exportedAt = new Date(data.exportedAt);
  const now = assigned.importedAt.getTime();
  if (!Number.isFinite(now) || exportedAt.getTime() > now + 300_000) throw new AgentError("VALIDATION_ERROR", "Orario di esportazione non valido.");
  let startedAt: string | null = null; let endedAt: string | null = null;
  if (data.source.kind === "webcam") {
    if (data.timeOriginUnixMs === null || (scope.startMs === null) !== (scope.endMs === null)) throw new AgentError("VALIDATION_ERROR", "Intervallo webcam non valido.");
    if (scope.startMs !== null && scope.endMs !== null) {
      const start = data.timeOriginUnixMs + scope.startMs; const end = data.timeOriginUnixMs + scope.endMs;
      if (start < 0 || end < start || end > now + 300_000 || end > exportedAt.getTime() + 300_000) throw new AgentError("VALIDATION_ERROR", "Intervallo webcam non valido.");
      try { startedAt = new Date(start).toISOString(); endedAt = new Date(end).toISOString(); }
      catch { throw new AgentError("VALIDATION_ERROR", "Intervallo webcam non valido."); }
    }
  } else if (data.timeOriginUnixMs !== null) throw new AgentError("VALIDATION_ERROR", "Orologio sintetico non valido.");
  const preliminary = VisionObservationSchema.safeParse({
    schemaVersion: "vision-observation-1", id: assigned.id, astronautId: assigned.astronautId, sessionId: assigned.sessionId,
    source: data.source.kind, exportSchemaVersion: data.schemaVersion, exportContractVersion: data.contractVersion,
    engineVersion: data.snapshot.engineVersion, configId: data.snapshot.config.configId, calibrationIds: data.snapshot.calibrationIds,
    sha256: assigned.sha256, startedAt, endedAt, exportedAt: exportedAt.toISOString(), importedAt: assigned.importedAt.toISOString(),
    elapsedMs: scope.elapsedMs, validMs: scope.validMs, coverage: scope.coverage, closureFraction: scope.closureFraction,
    ...scope.closures, interruption: data.application?.interruption ?? null, usability: "USABLE", reasons: [],
  });
  if (!preliminary.success) throw new AgentError("VALIDATION_ERROR", "Riepilogo della sessione non valido.");
  return VisionObservationSchema.parse({ ...preliminary.data, ...evaluateVisionQuality(preliminary.data, assigned.importedAt, assigned.quality) });
}
