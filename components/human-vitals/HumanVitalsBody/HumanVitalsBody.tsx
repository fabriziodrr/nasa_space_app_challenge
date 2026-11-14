import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { defaultVitalZones } from "./bodyZones";
import { HumanVitalsScene } from "./HumanVitalsScene";
import { VitalPanel } from "./VitalPanel";
import type { HumanVitalsBodyProps, VitalZone, VitalZoneId } from "./types";
import { defaultModelPath, femaleModelPath } from "./modelAsset";
import styles from "./HumanVitalsBody.module.css";

export function HumanVitalsBody({
  zones = defaultVitalZones,
  modelPath,
  bodyVariant = "female",
  initialZone = "overview",
  onZoneSelect,
  autoRotate = false,
  compact = false,
  className = "",
  resetToken = 0,
}: HumanVitalsBodyProps) {
  const selectedModelPath = modelPath ?? (bodyVariant === "female" ? femaleModelPath : defaultModelPath);
  const initial = zones.some((zone) => zone.id === initialZone) ? initialZone : "overview";
  const [selectedZone, setSelectedZone] = useState<VitalZoneId>(initial);
  const [hoveredZone, setHoveredZone] = useState<VitalZoneId | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelClosing, setPanelClosing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selected = useMemo(
    () => zones.find((zone) => zone.id === selectedZone) ?? zones[0],
    [selectedZone, zones],
  );

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  const selectZone = (zone: VitalZone) => {
    setSelectedZone(zone.id);
    setPanelClosing(false);
    setPanelOpen(true);
    onZoneSelect?.(zone);
  };

  const closePanel = useCallback(() => {
    if (!panelOpen) return;
    setPanelClosing(true);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      setPanelOpen(false);
      setPanelClosing(false);
      closeTimer.current = null;
    }, 220);
  }, [panelOpen]);

  useEffect(() => {
    if (!panelOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePanel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [panelOpen, closePanel]);

  const reset = () => {
    const overview = zones.find((zone) => zone.id === "overview") ?? zones[0];
    if (overview) {
      setSelectedZone(overview.id);
      setHoveredZone(null);
      onZoneSelect?.(overview);
    }
    closePanel();
  };

  useEffect(() => {
    if (resetToken === 0) return;
    reset();
  // The token is the explicit reset event from the global pill navigation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetToken]);

  if (!selected) return null;

  return (
    <section className={`${styles["human-vitals-body"]} ${compact ? styles["is-compact"] : ""} ${className}`}>
      <div className={styles["body-explorer"]}>
        <div className={styles["body-canvas"]}>
           <HumanVitalsScene
             key={`${bodyVariant}:${selectedModelPath}`}
             zones={zones}
            selectedZone={selectedZone}
            hoveredZone={hoveredZone}
            setHoveredZone={setHoveredZone}
            onSelect={selectZone}
             autoRotate={autoRotate}
             modelPath={selectedModelPath}
             bodyVariant={bodyVariant}
           />
           {panelOpen && (
             <VitalPanel
               key={selected.id}
               zone={selected}
               closing={panelClosing}
               onClose={closePanel}
               onReset={reset}
             />
           )}
           <div className={styles["canvas-hint"]}>DRAG TO ORBIT · SCROLL TO ZOOM</div>
        </div>
        <div className={styles["zone-legend"]}>
          <span className={styles["legend-dot"]} /> SELECT A ZONE TO INSPECT VITALS
          <span className={styles["legend-line"]} /> <span className={styles["legend-muted"]}>DATA LAYER: SYNTHETIC DEMO</span>
        </div>
      </div>
    </section>
  );
}

export type { BodyVariant, HumanVitalsBodyProps, VitalMetric, VitalSource, VitalStatus, VitalVisualization, VitalZone, VitalZoneId } from "./types";
