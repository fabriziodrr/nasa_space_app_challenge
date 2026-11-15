"use client";

import { SlothLogo } from "@/components/branding/SlothLogo";

export function DashboardTransition({ visible }: { visible: boolean }) {
  return (
    <div className={`dashboard-transition${visible ? " is-visible" : ""}`} aria-hidden={!visible}>
      <SlothLogo className="dashboard-transition__logo" alt="S.L.O.T.H. loading" />
    </div>
  );
}
