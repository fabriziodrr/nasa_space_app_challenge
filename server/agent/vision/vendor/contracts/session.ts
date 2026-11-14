import type { CalibrationState } from './calibration';
import type { EngineSnapshot } from './engine';
import type { FrameSourceKind } from './frame';
import type { AnalysisSample } from './sample';
import type { CONTRACT_VERSION } from './version';

/** Stati dell'applicazione T02/T04, distinti dagli stati della sola webcam. */
export type ApplicationPhase =
  | 'idle'
  | 'loading'
  | 'preview'
  | 'calibrating'
  | 'measuring'
  | 'stopped'
  | 'suspended'
  | 'error';

export type SessionInterruptionReason =
  | 'user_stop'
  | 'source_changed'
  | 'page_hidden'
  | 'device_lost'
  | 'calibration_invalidated'
  | 'sample_limit'
  | 'processing_error';

export interface ApplicationSessionSnapshot {
  readonly contractVersion: typeof CONTRACT_VERSION;
  readonly phase: ApplicationPhase;
  readonly source: FrameSourceKind | null;
  readonly calibration: CalibrationState;
  /** Stessa istantanea per UI ed esportazione; null prima della misura. */
  readonly engine: EngineSnapshot | null;
  /** Ultimo campione accettato, per mostrare i motivi di invalidità senza ricalcoli. */
  readonly lastSample: AnalysisSample | null;
  readonly interruption: SessionInterruptionReason | null;
  readonly error: {
    readonly stage: 'capture' | 'runtime' | 'inference' | 'calibration' | 'analysis';
    readonly message: string;
  } | null;
}
