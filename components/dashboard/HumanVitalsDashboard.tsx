"use client";

import {
  HumanVitalsBody,
  type BodyVariant,
} from "@/components/human-vitals/HumanVitalsBody";

type HumanVitalsDashboardProps = {
  perspective: "houston" | "iss";
  bodyVariant: BodyVariant;
  resetToken?: number;
};

export function HumanVitalsDashboard({ perspective, bodyVariant, resetToken = 0 }: HumanVitalsDashboardProps) {
  const isHouston = perspective === "houston";

  return (
    <section className="human-vitals-dashboard" aria-label={isHouston ? "Houston crew health" : "ISS astronaut health"}>
      <div className="human-vitals-dashboard__body">
        <HumanVitalsBody
          bodyVariant={bodyVariant}
          resetToken={resetToken}
        />
      </div>
    </section>
  );
}
