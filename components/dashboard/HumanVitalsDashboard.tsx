"use client";

import { useState } from "react";
import { SleepDataPanel } from "@/components/dashboard/SleepDataPanel";
import { defaultVitalZones } from "@/components/human-vitals/HumanVitalsBody/bodyZones";

import {
  HumanVitalsBody,
  type BodyVariant,
} from "@/components/human-vitals/HumanVitalsBody";

type HumanVitalsDashboardProps = {
  perspective: "houston" | "iss";
};

// These body-map values are hardcoded mock data, independent of the sleep API.
const demoZones = defaultVitalZones.map((zone) => ({
  ...zone,
  metrics: zone.metrics.map((metric) => ({ ...metric, source: "synthetic-demo" as const })),
}));

export function HumanVitalsDashboard({ perspective }: HumanVitalsDashboardProps) {
  const [bodyVariant, setBodyVariant] = useState<BodyVariant>("male");
  const isHouston = perspective === "houston";

  return (
    <section className="human-vitals-dashboard" aria-label={isHouston ? "Houston crew health" : "ISS astronaut health"}>
      <div className="human-vitals-dashboard__body">
        <HumanVitalsBody
          zones={demoZones}
          bodyVariant={bodyVariant}
          bodyVariantControls={
            <div className="human-vitals-dashboard__variant" role="group" aria-label="Body model">
              <span className="human-vitals-dashboard__variant-label">Model</span>
              <button
                className={bodyVariant === "female" ? "is-active" : ""}
                type="button"
                aria-pressed={bodyVariant === "female"}
                onClick={() => setBodyVariant("female")}
              >
                Female
              </button>
              <button
                className={bodyVariant === "male" ? "is-active" : ""}
                type="button"
                aria-pressed={bodyVariant === "male"}
                onClick={() => setBodyVariant("male")}
              >
                Male
              </button>
            </div>
          }
        />
      </div>
      <SleepDataPanel />
    </section>
  );
}
