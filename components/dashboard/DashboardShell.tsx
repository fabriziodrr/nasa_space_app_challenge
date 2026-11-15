"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";

import { HumanVitalsDashboard } from "@/components/dashboard/HumanVitalsDashboard";
import { CrewDataDashboard } from "@/components/dashboard/CrewDataDashboard";
import { MissionDashboard } from "@/components/dashboard/MissionDashboard";
import { SleepDataPanel } from "@/components/dashboard/SleepDataPanel";
import { DataAgentPanel } from "@/components/dashboard/DataAgentPanel";
import { PillNav } from "@/components/reactbits/PillNav";
import { TextType } from "@/components/reactbits/TextType";
import { DashboardIcon } from "@/components/dashboard/DashboardIcon";
import { DashboardTransition } from "@/components/dashboard/DashboardTransition";
import type { BodyVariant } from "@/components/human-vitals/HumanVitalsBody";

type DashboardView = "houston" | "iss";

/** Shared frame for the two S.L.O.T.H. mission operations perspectives. */
export function DashboardShell() {
  const [activeView, setActiveView] = useState<DashboardView>("houston");
  const [activeSection, setActiveSection] = useState<"human-vitals" | "crew-data" | "mission" | "sleep-history" | "data-agent">("human-vitals");
  const [resetToken, setResetToken] = useState(0);
  const [bodyVariant, setBodyVariant] = useState<BodyVariant>("male");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (transitionTimer.current) clearTimeout(transitionTimer.current);
  }, []);

  const transitionTo = useCallback((action: () => void) => {
    if (transitionTimer.current) clearTimeout(transitionTimer.current);
    setIsTransitioning(true);
    transitionTimer.current = setTimeout(() => {
      action();
      transitionTimer.current = setTimeout(() => setIsTransitioning(false), 220);
    }, 240);
  }, []);

  return (
    <div className="dashboard-shell" aria-label="S.L.O.T.H. mission dashboard">
      <main className="dashboard-shell__main" aria-label={`${activeView} dashboard workspace`}>
        <PillNav
          className="dashboard-shell__nav"
          brand="S.L.O.T.H."
          items={[
            { label: "Houston", active: activeView === "houston", onClick: () => transitionTo(() => { setActiveView("houston"); setActiveSection("human-vitals"); }), icon: <DashboardIcon name="grid" size={14} />, menu: (
              <div className="pill-nav__menu-panel">
                <button className="pill-nav__submenu-item is-available" type="button" role="menuitem" onClick={() => transitionTo(() => { setActiveView("houston"); setActiveSection("crew-data"); })}>
                  <span className="pill-nav__submenu-icon"><DashboardIcon name="crew" size={15} /></span>
                  <span className="pill-nav__submenu-copy"><strong>Crew Data</strong><small>Readiness &amp; recovery</small></span>
                  <DashboardIcon name="chevron" size={13} />
                </button>
                <button className="pill-nav__submenu-item is-available" type="button" role="menuitem" onClick={() => transitionTo(() => { setActiveView("houston"); setActiveSection("sleep-history"); })}>
                  <span className="pill-nav__submenu-icon"><DashboardIcon name="activity" size={15} /></span>
                  <span className="pill-nav__submenu-copy"><strong>Sleep history</strong><small>Sleep analysis</small></span>
                  <DashboardIcon name="chevron" size={13} />
                </button>
                <button className="pill-nav__submenu-item is-available" type="button" role="menuitem" onClick={() => transitionTo(() => { setActiveView("houston"); setActiveSection("data-agent"); })}>
                  <span className="pill-nav__submenu-icon"><DashboardIcon name="activity" size={15} /></span>
                  <span className="pill-nav__submenu-copy"><strong>Data agent</strong><small>Sleep &amp; vision</small></span>
                  <DashboardIcon name="chevron" size={13} />
                </button>
                <button className="pill-nav__submenu-item is-available" type="button" role="menuitem" onClick={() => transitionTo(() => { setActiveView("houston"); setActiveSection("mission"); })}>
                  <span className="pill-nav__submenu-icon"><DashboardIcon name="activity" size={15} /></span>
                  <span className="pill-nav__submenu-copy"><strong>Reports</strong><small>Mission summaries</small></span>
                  <DashboardIcon name="chevron" size={13} />
                </button>
              </div>
            ) },
            { label: "ISS", active: activeView === "iss", onClick: () => transitionTo(() => { setActiveView("iss"); setActiveSection("human-vitals"); }), icon: <DashboardIcon name="orbit" size={14} />, menu: (
              <div className="pill-nav__menu-panel"><button className="pill-nav__submenu-item is-available" type="button" role="menuitem" onClick={() => transitionTo(() => { setActiveView("iss"); setActiveSection("mission"); })}>
                <span className="pill-nav__submenu-icon"><DashboardIcon name="activity" size={15} /></span>
                <span className="pill-nav__submenu-copy"><strong>Schedule</strong><small>Daily program</small></span>
                <DashboardIcon name="chevron" size={13} />
              </button></div>
            ) },
          ]}
          trailing={(
            <div className="pill-nav__model-controls" role="group" aria-label="Body model and reset controls">
              <span className="pill-nav__section-label"><TextType text="Model" /></span>
              <button className={bodyVariant === "male" ? "is-active" : ""} type="button" aria-pressed={bodyVariant === "male"} onClick={() => transitionTo(() => setBodyVariant("male"))}><TextType text="Male" /></button>
              <button className={bodyVariant === "female" ? "is-active" : ""} type="button" aria-pressed={bodyVariant === "female"} onClick={() => transitionTo(() => setBodyVariant("female"))}><TextType text="Female" /></button>
              <span className="pill-nav__divider" aria-hidden="true" />
              <button className="pill-nav__reset" type="button" aria-label="Reset body view" onClick={() => transitionTo(() => setResetToken((token) => token + 1))}>
                <RotateCcw size={14} aria-hidden="true" />
                <TextType text="Reset" />
              </button>
            </div>
          )}
        />
        {activeSection === "human-vitals" ? <HumanVitalsDashboard perspective={activeView} bodyVariant={bodyVariant} resetToken={resetToken} />
          : activeSection === "crew-data" ? <CrewDataDashboard onBack={() => transitionTo(() => setActiveSection("human-vitals"))} />
          : activeSection === "mission" ? <MissionDashboard key={activeView} perspective={activeView} onBack={() => transitionTo(() => setActiveSection("human-vitals"))} />
          : <div className="dashboard-shell__data-panel">{activeSection === "sleep-history" ? <SleepDataPanel /> : <DataAgentPanel />}</div>}
      </main>
      <DashboardTransition visible={isTransitioning} />
    </div>
  );
}
