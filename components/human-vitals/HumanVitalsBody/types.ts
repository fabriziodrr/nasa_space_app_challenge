export type VitalZoneId =
  | "overview"
  | "head"
  | "heart"
  | "lungs"
  | "abdomen"
  | "left-arm"
  | "right-arm"
  | "left-leg"
  | "right-leg"
  | "back";

export type VitalStatus = "normal" | "attention" | "critical" | "neutral";
export type VitalSource = "synthetic-demo" | "self-reported" | "measured-in-app";
export type BodyVariant = "male" | "female";

export type VitalMetric = {
  label: string;
  value: string;
  unit?: string;
  status?: VitalStatus;
  source?: VitalSource;
};

export type VitalVisualization = {
  type: "ecg" | "respiration";
  label: string;
  waveform: number[];
};

export type VitalZone = {
  id: VitalZoneId;
  label: string;
  shortLabel: string;
  description: string;
  metrics: VitalMetric[];
  position: [number, number, number];
  rotation: { x: number; y: number; z: number };
  color: string;
  accentColor: string;
  backFacing?: boolean;
  visualization?: VitalVisualization;
};

export type HumanVitalsBodyProps = {
  zones?: VitalZone[];
  bodyImage?: string;
  modelPath?: string;
  bodyVariant?: BodyVariant;
  initialZone?: VitalZoneId;
  onZoneSelect?: (zone: VitalZone) => void;
  autoRotate?: boolean;
  showLabels?: boolean;
  compact?: boolean;
  className?: string;
  resetToken?: number;
};
