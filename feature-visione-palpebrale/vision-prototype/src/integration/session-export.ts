import type { AnalysisSample, CalibrationProfile, EngineSnapshot, ReplayFixture } from '../contracts';
import type { InferenceProvenance } from '../contracts/inference';
import type { ResolvedMediaPipeAdapterConfig } from '../inference/types';
import type { ResolvedCalibrationConfig } from '../contracts/calibration';
import type { ApplicationPhase, ApplicationSessionSnapshot, SessionInterruptionReason } from '../contracts/session';
import type { InferencePerformanceSample } from '../validation/types';
import { CONTRACT_VERSION } from '../contracts/version';
import { parseSessionExport } from './parse-session-export';
import { MAX_CHART_POINTS, MAX_PERFORMANCE_SAMPLES, MAX_SESSION_SAMPLES } from '../contracts/limits';

export interface SessionExport {
  readonly schemaVersion: 'crewready-session-v2';
  readonly contractVersion: typeof CONTRACT_VERSION;
  readonly exportedAt: string;
  readonly source: { readonly kind: 'webcam'; readonly device: CameraDevice | null; readonly imageDimensions: ImageDimensions | null; readonly limits: SessionLimits } | { readonly kind: 'synthetic'; readonly fixtureName: string; readonly fixtureVersion: string; readonly fixtureFingerprint: string };
  readonly units: { readonly time: 'ms'; readonly openness: 'normalized'; readonly fractions: '0-1' };
  readonly clock: 'performance-time-origin' | 'fixture-time';
  readonly timeOriginUnixMs: number | null;
  readonly calibration: { readonly kind: 'profiles'; readonly profiles: readonly CalibrationProfile[]; readonly configurations: Readonly<Record<string, ResolvedCalibrationConfig>> }
    | { readonly kind: 'synthetic-normalized'; readonly calibrationIds: readonly string[]; readonly reason: string };
  readonly inference: { readonly provenance: InferenceProvenance; readonly config: ResolvedMediaPipeAdapterConfig } | null;
  readonly unavailable: {
    readonly coverage: 'no_elapsed_time' | null;
    readonly closureFraction: 'no_valid_time' | null;
    readonly longestCompleteMs: 'no_complete_events' | null;
  };
  readonly snapshot: EngineSnapshot;
  readonly samples: readonly AnalysisSample[];
  readonly performanceSamples: readonly InferencePerformanceSample[];
  readonly application: { readonly phase: ApplicationPhase; readonly interruption: SessionInterruptionReason | null; readonly error: ApplicationSessionSnapshot['error'] } | null;
}

export interface CameraDevice { readonly id: string | null; readonly label: string | null }
export interface ImageDimensions { readonly width: number; readonly height: number }
export interface SessionLimits { readonly maxSamples: number; readonly maxChartPoints: number; readonly chartReduced: boolean }
export interface CalibrationExport { readonly profile: CalibrationProfile; readonly config: ResolvedCalibrationConfig }
type WebcamInput = { source: 'webcam'; snapshot: EngineSnapshot; samples: readonly AnalysisSample[]; calibrations: readonly CalibrationExport[]; inference: NonNullable<SessionExport['inference']>; timeOriginUnixMs: number; performanceSamples: readonly InferencePerformanceSample[]; imageDimensions: ImageDimensions | null; device: CameraDevice | null; limits: SessionLimits; application: NonNullable<SessionExport['application']> };
type SyntheticInput = { source: 'synthetic'; snapshot: EngineSnapshot; samples: readonly AnalysisSample[]; fixture: ReplayFixture };

function ensureSerializable(value: unknown, ancestors = new Set<object>()): void {
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Il risultato contiene un numero non serializzabile.');
  if (value === undefined || typeof value === 'function' || typeof value === 'bigint') throw new Error('Il risultato contiene un valore non serializzabile.');
  if (value && typeof value === 'object') {
    if (ancestors.has(value)) throw new Error('Il risultato contiene riferimenti circolari.');
    ancestors.add(value);
    for (const item of Object.values(value)) ensureSerializable(item, ancestors);
    ancestors.delete(value);
  }
}

/** Produce un pacchetto autonomo senza dipendere da React o da variabili globali. */
export function createSessionExport(input: WebcamInput | SyntheticInput, exportedAt: string): SessionExport {
  if (!Number.isFinite(Date.parse(exportedAt))) throw new Error('Data di esportazione non valida.');
  if (input.samples.length > MAX_SESSION_SAMPLES || (input.source === 'webcam' && input.performanceSamples.length > MAX_PERFORMANCE_SAMPLES)) throw new Error('Limite di campioni esportabili superato.');
  if (input.source === 'webcam' && input.calibrations.length === 0) throw new Error('Manca il profilo di calibrazione della sessione webcam.');
  if (input.source === 'webcam' && (!Number.isInteger(input.limits.maxSamples) || input.limits.maxSamples < 1 || input.limits.maxSamples > MAX_SESSION_SAMPLES
    || !Number.isInteger(input.limits.maxChartPoints) || input.limits.maxChartPoints < 2 || input.limits.maxChartPoints > MAX_CHART_POINTS
    || typeof input.limits.chartReduced !== 'boolean' || input.samples.length > input.limits.maxSamples)) throw new Error('Limiti della sessione non validi.');
  if (input.source === 'webcam' && input.snapshot.calibrationIds.some((id) => !input.calibrations.some((entry) => entry.profile.id === id))) {
    throw new Error('Manca un profilo per una delle calibrazioni usate nella sessione.');
  }
  if (input.source === 'webcam' && new Set(input.calibrations.map((entry) => entry.profile.id)).size !== input.calibrations.length) throw new Error('Identificativi di calibrazione duplicati.');
  const fingerprint = (fixture: ReplayFixture) => {
    const text = JSON.stringify({ name: fixture.name, version: fixture.fixtureVersion, config: fixture.config, samples: fixture.samples, stopAfterSamples: fixture.stopAfterSamples ?? false });
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return `fnv1a32-${(hash >>> 0).toString(16).padStart(8, '0')}`;
  };
  const result: SessionExport = {
    schemaVersion: 'crewready-session-v2', contractVersion: CONTRACT_VERSION, exportedAt,
    source: input.source === 'webcam' ? { kind: 'webcam', device: input.device, imageDimensions: input.imageDimensions, limits: input.limits } : { kind: 'synthetic', fixtureName: input.fixture.name, fixtureVersion: input.fixture.fixtureVersion, fixtureFingerprint: fingerprint(input.fixture) },
    units: { time: 'ms', openness: 'normalized', fractions: '0-1' },
    clock: input.source === 'webcam' ? 'performance-time-origin' : 'fixture-time',
    timeOriginUnixMs: input.source === 'webcam' ? input.timeOriginUnixMs : null,
    calibration: input.source === 'webcam'
      ? { kind: 'profiles', profiles: input.calibrations.map((entry) => entry.profile), configurations: Object.fromEntries(input.calibrations.map((entry) => [entry.profile.id, entry.config])) }
      : { kind: 'synthetic-normalized', calibrationIds: input.snapshot.calibrationIds, reason: 'Campioni sintetici già normalizzati; nessuna calibrazione fisica.' },
    inference: input.source === 'webcam' ? input.inference : null,
    unavailable: {
      coverage: input.snapshot.session.coverage === null ? 'no_elapsed_time' : null,
      closureFraction: input.snapshot.session.closureFraction === null ? 'no_valid_time' : null,
      longestCompleteMs: input.snapshot.session.closures.longestCompleteMs === null ? 'no_complete_events' : null,
    },
    snapshot: input.snapshot, samples: input.samples,
    performanceSamples: input.source === 'webcam' ? input.performanceSamples : [],
    application: input.source === 'webcam' ? input.application : null,
  };
  ensureSerializable(result);
  return parseSessionExport(JSON.stringify(result));
}

/** Esempio di consumatore separato: legge i valori senza ricalcolarli. */
export function summarizeExport(data: SessionExport) {
  return { source: data.source.kind, coverage: data.snapshot.session.coverage,
    closureFraction: data.snapshot.session.closureFraction, validMs: data.snapshot.session.validMs,
    incompleteEvents: data.snapshot.session.closures.incompleteCount };
}

export function serializeSessionExport(data: SessionExport): string {
  ensureSerializable(data);
  return JSON.stringify(data, null, 2);
}
