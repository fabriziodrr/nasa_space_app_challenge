import { CalibrationCollector, toAnalysisSample, toCalibrationState } from '../analysis/calibration';
import { TemporalEngine } from '../analysis/engine';
import type { CalibrationConfigInput, ResolvedCalibrationConfig } from '../contracts/calibration';
import type { ApplicationSessionSnapshot, SessionInterruptionReason } from '../contracts/session';
import type { AnalysisSample, CalibrationOutcome, CalibrationProgress, CalibrationProfile, FaceInferenceResult, InferenceFrameConsumer } from '../contracts';
import type { WebcamSnapshot } from '../capture/webcam';
import { MediaPipeFaceLandmarkerAdapter } from '../inference/mediapipe-adapter';
import { measureInference } from '../validation/performance';
import type { InferencePerformanceSample } from '../validation/types';
import { createSessionExport } from '../integration/session-export';
import { CONTRACT_VERSION } from '../contracts/version';
import { MAX_CHART_POINTS, MAX_SESSION_SAMPLES } from '../contracts/limits';
import type { CameraDevice } from '../integration/session-export';

export const DEFAULT_MAX_SESSION_SAMPLES = MAX_SESSION_SAMPLES;
export const DEFAULT_MAX_CHART_POINTS = MAX_CHART_POINTS;
export interface LivePoint { timestampMs: number; left: number | null; right: number | null; gap: boolean }
export interface LiveSnapshot extends ApplicationSessionSnapshot {
  readonly message: string;
  readonly progress: CalibrationProgress | null;
  readonly outcome: CalibrationOutcome | null;
  readonly inference: FaceInferenceResult | null;
  readonly history: readonly LivePoint[];
  /** Buffer solo append; sampleCount identifica il prefisso dell'istantanea. */
  readonly samples: readonly AnalysisSample[];
  readonly sampleCount: number;
  readonly performanceSamples: readonly InferencePerformanceSample[];
  readonly performanceCount: number;
  readonly exportProfile: CalibrationProfile | null;
  readonly exportCalibrationConfig: ResolvedCalibrationConfig | null;
  readonly timeOriginUnixMs: number | null;
  readonly chartReduced: boolean;
  readonly imageDimensions: { readonly width: number; readonly height: number } | null;
  readonly cameraDevice: CameraDevice | null;
  readonly sampleLimit: number;
  readonly chartLimit: number;
}
export interface LiveSessionOptions {
  readonly calibration?: CalibrationConfigInput;
  readonly maxSamples?: number;
  readonly maxChartPoints?: number;
  readonly now?: () => number;
}

export class LiveSession {
  private state: LiveSnapshot = {
    contractVersion: CONTRACT_VERSION, phase: 'idle', source: null, calibration: { status: 'idle' },
    engine: null, lastSample: null, interruption: null, error: null,
    message: 'Start analysis after enabling the webcam.', progress: null, outcome: null,
    inference: null, history: [], samples: [], sampleCount: 0, performanceSamples: [],
    performanceCount: 0, exportProfile: null, exportCalibrationConfig: null,
    timeOriginUnixMs: null, chartReduced: false, imageDimensions: null, cameraDevice: null,
    sampleLimit: DEFAULT_MAX_SESSION_SAMPLES, chartLimit: DEFAULT_MAX_CHART_POINTS,
  };
  private readonly collector: CalibrationCollector;
  private readonly maxSamples: number;
  private readonly maxChartPoints: number;
  private readonly now: () => number;
  private profile: CalibrationProfile | null = null;
  private engine = new TemporalEngine();
  private generation = 0;
  private dimensions: string | null = null;
  private currentDimensions: LiveSnapshot['imageDimensions'] = null;
  private lastPublish = -Infinity;
  private samples: AnalysisSample[] = [];
  private history: LivePoint[] = [];
  private performanceSamples: InferencePerformanceSample[] = [];
  private chartReduced = false;
  private cameraDevice: CameraDevice | null = null;
  readonly consume: InferenceFrameConsumer;

  constructor(private readonly adapter: MediaPipeFaceLandmarkerAdapter, private readonly notify: (value: LiveSnapshot) => void, options: LiveSessionOptions = {}) {
    this.collector = new CalibrationCollector(options.calibration);
    this.maxSamples = options.maxSamples ?? DEFAULT_MAX_SESSION_SAMPLES;
    this.maxChartPoints = options.maxChartPoints ?? DEFAULT_MAX_CHART_POINTS;
    if (!Number.isInteger(this.maxSamples) || this.maxSamples < 1 || this.maxSamples > DEFAULT_MAX_SESSION_SAMPLES
      || !Number.isInteger(this.maxChartPoints) || this.maxChartPoints < 2 || this.maxChartPoints > DEFAULT_MAX_CHART_POINTS) throw new Error('Limiti di sessione non validi.');
    this.state = { ...this.state, sampleLimit: this.maxSamples, chartLimit: this.maxChartPoints };
    this.now = options.now ?? (() => performance.now());
    this.consume = (frame, signal) => {
      if (!this.wantsFrames()) { frame.release(); return; }
      let stage: 'inference' | 'calibration' | 'analysis' = 'inference';
      try {
        const measured = measureInference(() => this.adapter.processFrame(frame, signal), this.now);
        if (measured.value.status !== 'cancelled' && !signal.aborted) {
          if (this.state.phase === 'measuring') this.performanceSamples.push({ timestampMs: measured.value.timestampMs, inferenceMs: measured.inferenceMs });
          stage = this.state.phase === 'calibrating' ? 'calibration' : this.state.phase === 'measuring' ? 'analysis' : 'inference';
          this.process(measured.value);
        }
      } catch (error) {
        this.interrupt('error', 'processing_error', error instanceof Error ? error.message : 'Processing error.', stage);
        throw error;
      } finally { frame.release(); }
    };
  }

  private publish(patch: Partial<LiveSnapshot>) { this.state = { ...this.state, ...patch }; this.notify(this.state); }
  private measurementSnapshot(): Partial<LiveSnapshot> {
    return { engine: this.engine.getSnapshot(), samples: this.samples, sampleCount: this.samples.length,
      history: [...this.history], performanceSamples: this.performanceSamples, performanceCount: this.performanceSamples.length,
      chartReduced: this.chartReduced };
  }
  wantsFrames(): boolean { return ['preview', 'calibrating', 'measuring'].includes(this.state.phase); }
  async start() {
    if (!['idle', 'stopped', 'suspended', 'error'].includes(this.state.phase)) return;
    const generation = ++this.generation;
    this.profile = null; this.collector.reset(); this.engine = new TemporalEngine(); this.dimensions = null; this.currentDimensions = null;
    this.samples = []; this.history = []; this.performanceSamples = []; this.chartReduced = false;
    this.publish({ phase: 'loading', source: 'webcam', calibration: { status: 'idle' }, interruption: null, error: null, lastSample: null,
      message: 'Loading local model…', progress: null, outcome: null, inference: null, engine: null,
      samples: this.samples, sampleCount: 0, history: [], performanceSamples: this.performanceSamples, performanceCount: 0,
      exportProfile: null, exportCalibrationConfig: null, imageDimensions: null, chartReduced: false });
    try {
      await this.adapter.init();
      if (generation === this.generation) this.publish({ phase: 'preview', message: 'Model ready. Start calibration.' });
    } catch (error) {
      if (generation === this.generation) this.interrupt('error', 'processing_error', error instanceof Error ? error.message : 'Error di caricamento del modello.', 'runtime');
    }
  }
  startOpen() {
    if (this.state.phase !== 'preview') return;
    this.profile = null; this.collector.start(); this.samples = []; this.history = []; this.performanceSamples = []; this.chartReduced = false;
    const progress = this.collector.getProgress();
    this.publish({ phase: 'calibrating', calibration: toCalibrationState(progress), progress, outcome: null, engine: null, lastSample: null,
      history: [], samples: this.samples, sampleCount: 0, performanceSamples: this.performanceSamples, performanceCount: 0,
      exportProfile: null, exportCalibrationConfig: null, interruption: null, error: null, message: 'Look forward and keep your eyes open.' });
  }
  startClosed() {
    if (this.state.phase !== 'calibrating' || !this.collector.getProgress().open.complete) return;
    this.collector.beginPhase('closed'); const progress = this.collector.getProgress();
    this.publish({ calibration: toCalibrationState(progress), progress, message: 'Close both eyes without squeezing them.' });
  }
  finishCalibration() {
    if (this.state.phase !== 'calibrating' || !this.collector.getProgress().closed.complete) return;
    const outcome = this.collector.finish({ id: `cal-${crypto.randomUUID()}`, capturedAtMs: Date.now() });
    this.profile = outcome.profile; const progress = this.collector.getProgress();
    this.publish({ phase: 'preview', calibration: toCalibrationState(progress, outcome), outcome, progress,
      message: outcome.success ? 'Calibration complete. You can start the measurement.' : 'Insufficient calibration. Repeat the procedure.' });
  }
  startMeasurement() {
    if (!this.profile || this.state.phase !== 'preview' || this.state.calibration.status !== 'ready') return;
    this.engine.start(); this.samples = []; this.history = []; this.performanceSamples = []; this.chartReduced = false; this.lastPublish = -Infinity;
    this.publish({ ...this.measurementSnapshot(), phase: 'measuring', lastSample: null, interruption: null, error: null,
      exportProfile: this.profile, exportCalibrationConfig: this.collector.getConfig(), timeOriginUnixMs: performance.timeOrigin,
      imageDimensions: this.currentDimensions, cameraDevice: this.cameraDevice, message: 'Measuring.' });
  }
  stopMeasurement(message = 'Measurement stopped.', reason: SessionInterruptionReason = 'user_stop') {
    if (this.state.phase !== 'measuring') return;
    this.engine.stop(); this.publish({ ...this.measurementSnapshot(), phase: 'preview', interruption: reason, message });
  }
  stop(message = 'Analysis stopped.'): void { this.interrupt('stopped', 'user_stop', message); }
  handleCaptureState(state: WebcamSnapshot): void {
    if (state.status === 'active' || state.status === 'starting') this.cameraDevice = state.device;
    if (state.status !== 'idle' && this.state.source !== 'webcam') this.publish({ source: 'webcam' });
    if (state.status === 'suspended') this.interrupt('suspended', 'page_hidden', state.message);
    else if (state.status === 'error') {
      const processingFailure = state.interruption === 'processing_error' && this.state.phase === 'error'
        && this.state.error !== null && ['inference', 'calibration', 'analysis'].includes(this.state.error.stage);
      if (!processingFailure) this.interrupt('error', state.interruption ?? 'processing_error', state.message, 'capture');
    } else if (state.status === 'idle') this.interrupt('stopped', state.interruption ?? 'user_stop', state.message);
  }
  private interrupt(phase: 'stopped' | 'suspended' | 'error', reason: SessionInterruptionReason, message: string, stage?: NonNullable<ApplicationSessionSnapshot['error']>['stage']) {
    const interruptedCalibration = this.state.phase === 'calibrating';
    this.generation++; this.engine.stop(); this.adapter.release(); this.profile = null; this.collector.reset(); this.dimensions = null; this.currentDimensions = null;
    this.publish({ ...(this.state.engine ? this.measurementSnapshot() : {}), phase, interruption: reason,
      calibration: interruptedCalibration ? { status: 'insufficient', reasons: ['interrupted'] } : { status: 'idle' },
      error: stage ? { stage, message } : null, message, progress: null, outcome: null, inference: null });
  }
  exportSnapshot(displayed: LiveSnapshot) {
    if (!displayed.engine || !displayed.exportProfile || !displayed.exportCalibrationConfig || displayed.timeOriginUnixMs === null) throw new Error('No webcam measurement available to export.');
    return createSessionExport({ source: 'webcam', snapshot: displayed.engine, samples: displayed.samples.slice(0, displayed.sampleCount),
      calibrations: [{ profile: displayed.exportProfile, config: displayed.exportCalibrationConfig }], timeOriginUnixMs: displayed.timeOriginUnixMs,
      performanceSamples: displayed.performanceSamples.slice(0, displayed.performanceCount), imageDimensions: displayed.imageDimensions,
      device: displayed.cameraDevice,
      limits: { maxSamples: displayed.sampleLimit, maxChartPoints: displayed.chartLimit, chartReduced: displayed.chartReduced },
      application: { phase: displayed.phase, interruption: displayed.interruption, error: displayed.error },
      inference: { provenance: this.adapter.getProvenance(), config: this.adapter.getConfig() } }, new Date().toISOString());
  }
  private addPoint(point: LivePoint) {
    this.history.push(point);
    if (this.history.length > this.maxChartPoints) {
      const reduced: LivePoint[] = [this.history[0]!];
      for (let i = 2; i < this.history.length; i += 2) {
        const a = this.history[i - 1]!, b = this.history[i]!;
        reduced.push({ ...b, gap: a.gap || b.gap || a.left === null || a.right === null });
      }
      const last = this.history[this.history.length - 1]!;
      if (reduced[reduced.length - 1]?.timestampMs !== last.timestampMs) reduced.push(last);
      this.history = reduced; this.chartReduced = true;
    }
  }
  private process(result: FaceInferenceResult) {
    const dimensions = `${result.geometry.imageWidth}x${result.geometry.imageHeight}`;
    if (this.dimensions && this.dimensions !== dimensions) { this.interrupt('stopped', 'calibration_invalidated', 'Risoluzione cambiata: riavvia l’analisi e ripeti la calibrazione.'); return; }
    this.dimensions = dimensions; this.currentDimensions = { width: result.geometry.imageWidth, height: result.geometry.imageHeight };
    let progress = this.state.progress;
    let calibration = this.state.calibration;
    let lastSample = this.state.lastSample;
    if (this.state.phase === 'calibrating') {
      const current = this.collector.getProgress();
      if (current.activePhase && !current[current.activePhase].complete) progress = this.collector.addSample(result.geometry);
      if (progress) calibration = toCalibrationState(progress);
    }
    if (this.state.phase === 'measuring' && this.profile) {
      const sample = toAnalysisSample(result.geometry, this.profile);
      this.samples.push(sample);
      const accepted = this.engine.processSample(sample);
      if (accepted.status === 'accepted') {
        lastSample = sample;
        this.addPoint({ timestampMs: sample.timestampMs, left: sample.left.validity === 'valid' ? sample.left.openness : null,
          right: sample.right.validity === 'valid' ? sample.right.openness : null, gap: accepted.gap || accepted.calibrationChanged });
      }
    }
    this.state = { ...this.state, inference: result, progress, calibration, lastSample };
    if (this.state.phase === 'measuring' && this.samples.length >= this.maxSamples) {
      this.stopMeasurement(`The ${this.maxSamples} sample limit was reached. Measurement stopped and remains available for export.`, 'sample_limit'); return;
    }
    if (result.timestampMs - this.lastPublish >= 200) {
      this.lastPublish = result.timestampMs;
      this.publish(this.state.phase === 'measuring' ? this.measurementSnapshot() : {});
    }
  }
}
