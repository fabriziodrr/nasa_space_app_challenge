import * as THREE from "three";
import type { VitalZoneId } from "./types";

export function createFemaleMarkerPositions(bounds: THREE.Box3): Record<VitalZoneId, [number, number, number]> {
  const min = bounds.min;
  const size = bounds.getSize(new THREE.Vector3());
  const y = (ratio: number) => min.y + size.y * ratio;
  const front = bounds.max.z + Math.max(size.z * 0.18, 0.035);
  const back = bounds.min.z - Math.max(size.z * 0.18, 0.035);
  const centerX = min.x + size.x / 2;

  return {
    overview: [centerX, y(0.48), front],
    head: [centerX, y(0.86), front],
    heart: [centerX + size.x * 0.08, y(0.75), front],
    lungs: [centerX - size.x * 0.05, y(0.71), front],
    abdomen: [centerX, y(0.62), front],
    "left-arm": [centerX - size.x * 0.36, y(0.59), front],
    "right-arm": [centerX + size.x * 0.36, y(0.59), front],
    "left-leg": [centerX - size.x * 0.14, y(0.17), front],
    "right-leg": [centerX + size.x * 0.14, y(0.17), front],
    back: [centerX, y(0.62), back],
  };
}
