"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";

import { HumanVitalsDashboard } from "@/components/dashboard/HumanVitalsDashboard";
import { PillNav } from "@/components/reactbits/PillNav";
import { TextType } from "@/components/reactbits/TextType";
import { DashboardIcon } from "@/components/dashboard/DashboardIcon";
import type { BodyVariant } from "@/components/human-vitals/HumanVitalsBody";

type DashboardView = "houston" | "iss";

/** Shared frame for the two SOTERIA mission operations perspectives. */
export function DashboardShell() {
  const [activeView, setActiveView] = useState<DashboardView>("houston");
  const [resetToken, setResetToken] = useState(0);
  const [bodyVariant, setBodyVariant] = useState<BodyVariant>("male");

  return (
    <div className="dashboard-shell" aria-label="SOTERIA mission dashboard">
      <main className="dashboard-shell__main" aria-label={`${activeView} dashboard workspace`}>
        <PillNav
          className="dashboard-shell__nav"
          items={[
            { label: "Houston", active: activeView === "houston", onClick: () => setActiveView("houston"), icon: <DashboardIcon name="grid" size={14} /> },
            { label: "ISS", active: activeView === "iss", onClick: () => setActiveView("iss"), icon: <DashboardIcon name="orbit" size={14} /> },
          ]}
          trailing={(
            <div className="pill-nav__model-controls" role="group" aria-label="Body model and reset controls">
              <span className="pill-nav__section-label"><TextType text="Model" /></span>
              <button className={bodyVariant === "male" ? "is-active" : ""} type="button" aria-pressed={bodyVariant === "male"} onClick={() => setBodyVariant("male")}><TextType text="Male" /></button>
              <button className={bodyVariant === "female" ? "is-active" : ""} type="button" aria-pressed={bodyVariant === "female"} onClick={() => setBodyVariant("female")}><TextType text="Female" /></button>
              <span className="pill-nav__divider" aria-hidden="true" />
              <button className="pill-nav__reset" type="button" aria-label="Reset body view" onClick={() => setResetToken((token) => token + 1)}>
                <RotateCcw size={14} aria-hidden="true" />
                <TextType text="Reset" />
              </button>
            </div>
          )}
        />
        <HumanVitalsDashboard perspective={activeView} bodyVariant={bodyVariant} resetToken={resetToken} />
      </main>
    </div>
  );
}
