"use client";

import { useState } from "react";

import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { DashboardViewSwitch, type DashboardView } from "@/components/dashboard/DashboardViewSwitch";

/** Shared frame for the two SOTERIA mission operations perspectives. */
export function DashboardShell() {
  const [activeView, setActiveView] = useState<DashboardView>("houston");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return (
    <div
      className={isSidebarCollapsed ? "dashboard-shell is-sidebar-collapsed" : "dashboard-shell"}
      aria-label="SOTERIA mission dashboard"
    >
      <DashboardSidebar
        isCollapsed={isSidebarCollapsed}
        onCollapse={() => setIsSidebarCollapsed((collapsed) => !collapsed)}
      />
      <main className="dashboard-shell__main" aria-label={`${activeView} dashboard workspace`}>
        <div className="dashboard-shell__switch">
          <DashboardViewSwitch activeView={activeView} onViewChange={setActiveView} />
        </div>
      </main>
    </div>
  );
}
