import { DashboardIcon } from "@/components/dashboard/DashboardIcon";

export type DashboardView = "houston" | "iss";

type DashboardViewSwitchProps = {
  activeView: DashboardView;
  onViewChange: (view: DashboardView) => void;
};

export function DashboardViewSwitch({ activeView, onViewChange }: DashboardViewSwitchProps) {
  return (
    <div className="dashboard-view-switch" aria-label="Select mission perspective" role="group">
      <button
        className={activeView === "houston" ? "dashboard-view-switch__button is-active" : "dashboard-view-switch__button"}
        type="button"
        aria-pressed={activeView === "houston"}
        onClick={() => onViewChange("houston")}
      >
        <DashboardIcon name="grid" size={16} />
        <span>Houston</span>
      </button>
      <button
        className={activeView === "iss" ? "dashboard-view-switch__button is-active" : "dashboard-view-switch__button"}
        type="button"
        aria-pressed={activeView === "iss"}
        onClick={() => onViewChange("iss")}
      >
        <DashboardIcon name="orbit" size={16} />
        <span>ISS</span>
      </button>
    </div>
  );
}
