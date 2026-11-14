import type { VitalZoneId } from "./types";

// Original male GLB calibration from the reusable body component on origin/main.
export const maleMarkerPositions: Record<VitalZoneId, [number, number, number]> = {
  overview: [0, 1.35, 0.3],
  head: [0, 2.63, 0.37],
  // The male model is normalized to 2.85 units high: these match the
  // female heart/lung ratios of 0.75 and 0.71.
  heart: [0.12, 2.1375, 0.43],
  lungs: [-0.1, 2.0235, 0.4],
  abdomen: [0, 1.65, 0.4],
  "left-arm": [-0.78, 1.61, 0.2],
  "right-arm": [0.78, 1.61, 0.2],
  "left-leg": [-0.2, 0.48, 0.25],
  "right-leg": [0.2, 0.48, 0.25],
  back: [0, 1.78, -0.39],
};
