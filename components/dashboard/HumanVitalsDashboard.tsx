"use client";

import { defaultVitalZones } from "@/components/human-vitals/HumanVitalsBody/bodyZones";
import { VoiceDemo } from "@/app/voice-demo/voice-demo";
import { useEffect, useRef, useState } from "react";

import {
  HumanVitalsBody,
  type BodyVariant,
} from "@/components/human-vitals/HumanVitalsBody";

type HumanVitalsDashboardProps = {
  perspective: "houston" | "iss";
  bodyVariant: BodyVariant;
  resetToken?: number;
  astronautId?: string;
};

// These body-map values are hardcoded mock data, independent of the sleep API.
const demoZones = defaultVitalZones.map((zone) => ({
  ...zone,
  metrics: zone.metrics.map((metric) => ({ ...metric, source: "synthetic-demo" as const })),
}));

export function HumanVitalsDashboard({ perspective, bodyVariant, resetToken = 0, astronautId }: HumanVitalsDashboardProps) {
  const isHouston = perspective === "houston";
  const [visionTarget, setVisionTarget] = useState<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const animation = bodyRef.current?.animate([
      { opacity: 0.25, transform: "translateY(10px) scale(.98)", filter: "blur(3px)" },
      { opacity: 1, transform: "translateY(0) scale(1)", filter: "blur(0)" },
    ], { duration: 520, easing: "cubic-bezier(.2,.8,.2,1)" });
    return () => animation?.cancel();
  }, [astronautId, bodyVariant]);

  return (
    <section className={`human-vitals-dashboard ${isHouston ? "" : "human-vitals-dashboard--iss"}`} aria-label={isHouston ? "Houston crew health" : "Astronaut health"}>
      {!isHouston && <div className="human-vitals-dashboard__assistant"><VoiceDemo key={astronautId} embedded visionTarget={visionTarget} initialAstronautId={astronautId} /></div>}
      <div className="human-vitals-dashboard__body" ref={bodyRef}>
        <HumanVitalsBody
          zones={demoZones}
          bodyVariant={bodyVariant}
          resetToken={resetToken}
          panelBeside={!isHouston}
        />
      </div>
      {!isHouston && <div className="human-vitals-dashboard__vision" ref={setVisionTarget} />}
    </section>
  );
}
