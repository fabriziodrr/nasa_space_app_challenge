"use client";

import { defaultVitalZones } from "@/components/human-vitals/HumanVitalsBody/bodyZones";
import { VoiceDemo } from "@/app/voice-demo/voice-demo";

import {
  HumanVitalsBody,
  type BodyVariant,
} from "@/components/human-vitals/HumanVitalsBody";

type HumanVitalsDashboardProps = {
  perspective: "houston" | "iss";
  bodyVariant: BodyVariant;
  resetToken?: number;
};

// These body-map values are hardcoded mock data, independent of the sleep API.
const demoZones = defaultVitalZones.map((zone) => ({
  ...zone,
  metrics: zone.metrics.map((metric) => ({ ...metric, source: "synthetic-demo" as const })),
}));

export function HumanVitalsDashboard({ perspective, bodyVariant, resetToken = 0 }: HumanVitalsDashboardProps) {
  const isHouston = perspective === "houston";

  return (
    <section className={`human-vitals-dashboard ${isHouston ? "" : "human-vitals-dashboard--iss"}`} aria-label={isHouston ? "Houston crew health" : "ISS astronaut health"}>
      <div className="human-vitals-dashboard__body">
        <HumanVitalsBody
          zones={demoZones}
          bodyVariant={bodyVariant}
          resetToken={resetToken}
          panelBeside={!isHouston}
        />
      </div>
      {!isHouston && <div className="human-vitals-dashboard__assistant"><VoiceDemo embedded /></div>}
    </section>
  );
}
