import { DashboardIcon } from "@/components/dashboard/DashboardIcon";
import { BorderGlow } from "@/components/reactbits/BorderGlow";

export type DashboardView = "houston" | "iss";

type DashboardViewSwitchProps = {
  activeView: DashboardView;
  onViewChange: (view: DashboardView) => void;
};

export function DashboardViewSwitch({ activeView, onViewChange }: DashboardViewSwitchProps) {
  return (
    <div className="dashboard-view-switch" aria-label="Select mission perspective" role="group">
      {activeView === "houston" ? (
        <BorderGlow className="dashboard-view-switch__glow">
          <button
            className="dashboard-view-switch__button is-active"
            type="button"
            aria-pressed="true"
            onClick={() => onViewChange("houston")}
          >
            <DashboardIcon name="grid" size={16} />
            <span>Houston</span>
          </button>
        </BorderGlow>
      ) : (
        <button
          className="dashboard-view-switch__button"
          type="button"
          aria-pressed="false"
          onClick={() => onViewChange("houston")}
        >
          <DashboardIcon name="grid" size={16} />
          <span>Houston</span>
        </button>
      )}
      {activeView === "iss" ? (
        <BorderGlow className="dashboard-view-switch__glow">
          <button
            className="dashboard-view-switch__button is-active"
            type="button"
            aria-pressed="true"
            onClick={() => onViewChange("iss")}
          >
            <DashboardIcon name="orbit" size={16} />
            <span>ISS</span>
          </button>
        </BorderGlow>
      ) : (
        <button
          className="dashboard-view-switch__button"
          type="button"
          aria-pressed="false"
          onClick={() => onViewChange("iss")}
        >
          <DashboardIcon name="orbit" size={16} />
          <span>ISS</span>
        </button>
      )}
    </div>
  );
}
