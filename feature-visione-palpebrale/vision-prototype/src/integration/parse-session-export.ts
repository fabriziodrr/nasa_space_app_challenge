import { TemporalEngine } from '../analysis/engine';
import { resolveCalibrationConfig } from '../analysis/calibration';
import { EYE_INVALIDITY_REASONS } from '../contracts/sample';
import { CONTRACT_VERSION } from '../contracts/version';
import { summarizeInferencePerformance } from '../validation/performance';
import type { SessionExport } from './session-export';
import { MAX_CHART_POINTS, MAX_PERFORMANCE_SAMPLES, MAX_SESSION_SAMPLES } from '../contracts/limits';

const MAX_JSON_LENGTH = 50_000_000;
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function text(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function fail(message: string): never { throw new Error(`JSON sessione non valido: ${message}`); }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (record(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

/** Valida un file esterno v2 e verifica l'istantanea riproducendo i campioni. */
export function parseSessionExport(json: string): SessionExport {
  if (json.length > MAX_JSON_LENGTH) fail('dimensione superiore al limite di 50 milioni di caratteri.');
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { return fail('sintassi JSON.'); }
  if (!record(raw) || raw.schemaVersion !== 'crewready-session-v2' || raw.contractVersion !== CONTRACT_VERSION) fail('versione dello schema o del contratto non supportata.');
  if (!text(raw.exportedAt) || !Number.isFinite(Date.parse(raw.exportedAt))) fail('data di esportazione.');
  if (!record(raw.units) || raw.units.time !== 'ms' || raw.units.openness !== 'normalized' || raw.units.fractions !== '0-1') fail('unità.');
  if (!record(raw.source) || (raw.source.kind !== 'webcam' && raw.source.kind !== 'synthetic')) fail('origine.');
  if (!record(raw.snapshot) || !record(raw.snapshot.config) || !record(raw.calibration) || !Array.isArray(raw.samples) || !Array.isArray(raw.performanceSamples)) fail('istantanea, calibrazione o campioni.');
  if (raw.samples.length > MAX_SESSION_SAMPLES || raw.performanceSamples.length > MAX_PERFORMANCE_SAMPLES) fail('limite di campioni superato.');
  const knownReasons = new Set<string>(EYE_INVALIDITY_REASONS);
  const validEye = (value: unknown) => record(value) && (value.validity === 'valid'
    ? finite(value.openness)
    : value.validity === 'invalid' && !('openness' in value) && Array.isArray(value.reasons)
      && value.reasons.length > 0 && value.reasons.every((reason) => typeof reason === 'string' && knownReasons.has(reason)));
  for (const sample of raw.samples) {
    if (!record(sample) || !finite(sample.timestampMs) || typeof sample.calibrationId !== 'string' || !validEye(sample.left) || !validEye(sample.right)) fail('formato di un campione.');
  }
  const data = raw as unknown as SessionExport;
  try {
    const engine = new TemporalEngine(data.snapshot.config);
    if (data.snapshot.status !== 'idle') engine.start();
    else if (data.samples.length) fail('campioni in una sessione inattiva.');
    for (const sample of data.samples) engine.processSample(sample);
    if (data.snapshot.status === 'stopped') engine.stop();
    if (canonical(engine.getSnapshot()) !== canonical(data.snapshot)) fail('istantanea non coerente con configurazione e campioni.');
    summarizeInferencePerformance(data.performanceSamples);
  } catch (error) { return fail(error instanceof Error ? error.message : 'campioni o configurazione.'); }
  if (!record(raw.unavailable) || raw.unavailable.coverage !== (data.snapshot.session.coverage === null ? 'no_elapsed_time' : null)
    || raw.unavailable.closureFraction !== (data.snapshot.session.closureFraction === null ? 'no_valid_time' : null)
    || raw.unavailable.longestCompleteMs !== (data.snapshot.session.closures.longestCompleteMs === null ? 'no_complete_events' : null)) fail('motivi di indisponibilità.');

  if (data.source.kind === 'synthetic') {
    if (!text(data.source.fixtureName) || !text(data.source.fixtureVersion) || !/^fnv1a32-[0-9a-f]{8}$/.test(data.source.fixtureFingerprint)
      || data.clock !== 'fixture-time' || data.timeOriginUnixMs !== null || data.inference !== null || data.application !== null
      || data.performanceSamples.length || data.calibration.kind !== 'synthetic-normalized'
      || canonical(data.calibration.calibrationIds) !== canonical(data.snapshot.calibrationIds)
      || !text(data.calibration.reason)) fail('metadati sintetici.');
  } else {
    if (data.clock !== 'performance-time-origin' || !finite(data.timeOriginUnixMs) || data.timeOriginUnixMs < 0
      || !record(raw.inference) || !record(raw.application) || !record(raw.calibration) || data.calibration.kind !== 'profiles'
      || !Array.isArray(data.calibration.profiles) || !record(data.calibration.configurations)) fail('metadati webcam.');
    const source = data.source;
    if (!data.calibration.profiles.length) fail('profilo webcam mancante.');
    if (!record(source.limits) || !Number.isInteger(source.limits.maxSamples) || source.limits.maxSamples < 1 || source.limits.maxSamples > MAX_SESSION_SAMPLES
      || !Number.isInteger(source.limits.maxChartPoints) || source.limits.maxChartPoints < 2 || source.limits.maxChartPoints > MAX_CHART_POINTS
      || typeof source.limits.chartReduced !== 'boolean' || data.samples.length > source.limits.maxSamples) fail('limiti di sessione.');
    if (source.device !== null && (!record(source.device) || (source.device.id !== null && typeof source.device.id !== 'string') || (source.device.label !== null && typeof source.device.label !== 'string'))) fail('dispositivo webcam.');
    if (source.imageDimensions !== null && (!record(source.imageDimensions) || !Number.isInteger(source.imageDimensions.width) || !Number.isInteger(source.imageDimensions.height) || source.imageDimensions.width <= 0 || source.imageDimensions.height <= 0)) fail('dimensioni immagine.');
    const phases = ['idle', 'loading', 'preview', 'calibrating', 'measuring', 'stopped', 'suspended', 'error'];
    const interruptions = ['user_stop', 'source_changed', 'page_hidden', 'device_lost', 'calibration_invalidated', 'sample_limit', 'processing_error'];
    if (!data.application || !phases.includes(data.application.phase)
      || (data.application.interruption !== null && !interruptions.includes(data.application.interruption))
      || (data.application.error !== null && (!record(data.application.error) || !['capture', 'runtime', 'inference', 'calibration', 'analysis'].includes(data.application.error.stage) || !text(data.application.error.message)))
      || (data.application.phase === 'error') !== (data.application.error !== null)) fail('stato applicativo.');
    const ids = new Set<string>();
    for (const profile of data.calibration.profiles) {
      if (!record(profile) || !text(profile.id) || ids.has(profile.id) || !text(profile.version) || !text(profile.methodVersion)
        || !finite(profile.capturedAtMs) || profile.capturedAtMs < 0 || profile.normalization !== 'open-closed-v1' || !record(profile.eyes)) fail('profilo di calibrazione.');
      ids.add(profile.id);
      for (const side of ['left', 'right'] as const) {
        const eye = profile.eyes[side];
        if (!record(eye) || !finite(eye.open) || !finite(eye.closed) || !finite(eye.minimumSeparation)
          || eye.closed < 0 || eye.minimumSeparation <= 0 || eye.open - eye.closed < eye.minimumSeparation) fail('riferimenti di calibrazione.');
      }
      const config = data.calibration.configurations[profile.id];
      if (!record(config)) fail('configurazione di calibrazione mancante.');
      try { if (canonical(resolveCalibrationConfig(config)) !== canonical(config)) fail('configurazione di calibrazione incoerente.'); }
      catch { return fail('configurazione di calibrazione non valida.'); }
    }
    if (data.snapshot.calibrationIds.some((id) => !ids.has(id))) fail('profilo di calibrazione mancante.');
    const inference = data.inference;
    if (!inference || !record(inference.config) || !record(inference.provenance)) fail('provenienza inferenza.');
    const provenanceKeys = ['adapterVersion', 'runtime', 'runtimeVersion', 'runtimeLicense', 'runtimeSource', 'model', 'modelVersion', 'modelId', 'modelSha256', 'modelLicense', 'modelSource', 'geometryMethodVersion', 'configId'] as const;
    if (provenanceKeys.some((key) => !text(inference.provenance[key])) || !/^[0-9a-f]{64}$/i.test(inference.provenance.modelSha256)
      || !Number.isInteger(inference.provenance.modelSizeBytes) || inference.provenance.modelSizeBytes <= 0
      || !text(inference.config.modelAssetPath) || !text(inference.config.wasmAssetPath) || !text(inference.config.configId)
      || !record(inference.config.geometry) || !text(inference.config.geometry.configId)
      || !['CPU', 'GPU'].includes(inference.config.delegate) || inference.provenance.configId !== inference.config.configId
      || inference.provenance.delegate !== inference.config.delegate || inference.provenance.numFaces !== inference.config.numFaces
      || !Number.isInteger(inference.config.numFaces) || inference.config.numFaces < 1 || inference.config.numFaces > 4
      || ![inference.config.minFaceDetectionConfidence, inference.config.minFacePresenceConfidence, inference.config.minTrackingConfidence].every((value) => finite(value) && value >= 0 && value <= 1)
      || !finite(inference.config.geometry.minEyeWidthPx) || inference.config.geometry.minEyeWidthPx <= 0
      || !finite(inference.config.geometry.maxEyeAspectRatio) || inference.config.geometry.maxEyeAspectRatio <= 0
      || !finite(inference.config.geometry.coordinateTolerancePx) || inference.config.geometry.coordinateTolerancePx < 0) fail('configurazione inferenza.');
  }
  return data;
}
