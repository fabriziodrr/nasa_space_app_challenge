import { DashboardIcon } from "@/components/dashboard/DashboardIcon";

type DashboardSidebarProps = {
  isCollapsed: boolean;
  onCollapse: () => void;
};

const navigationItems = [
  { label: "Overview", icon: "grid" as const },
  { label: "Mission orbit", icon: "orbit" as const },
  { label: "Live telemetry", icon: "activity" as const },
  { label: "Crew status", icon: "crew" as const },
];

export function DashboardSidebar({ isCollapsed, onCollapse }: DashboardSidebarProps) {
  return (
    <aside className={isCollapsed ? "dashboard-sidebar is-collapsed" : "dashboard-sidebar"}>
      <div className="dashboard-sidebar__brand">
        <span className="dashboard-sidebar__wordmark">SOTERIA</span>
      </div>
      <button
        className="dashboard-sidebar__toggle"
        type="button"
        aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-expanded={!isCollapsed}
        onClick={onCollapse}
      >
        <DashboardIcon name="chevron" size={15} />
      </button>

      <div className="dashboard-sidebar__section-label">Workspace</div>
      <nav className="dashboard-sidebar__nav" aria-label="Mission dashboard sections">
        {navigationItems.map((item, index) => (
          <button
            className={index === 0 ? "dashboard-sidebar__item is-active" : "dashboard-sidebar__item"}
            type="button"
            key={item.label}
            aria-current={index === 0 ? "page" : undefined}
          >
            <DashboardIcon name={item.icon} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="dashboard-sidebar__footer">
        <button className="dashboard-sidebar__settings" type="button">
          <DashboardIcon name="settings" size={17} />
          <span>System settings</span>
        </button>
        <div className="dashboard-sidebar__connection">
          <span className="dashboard-sidebar__status-dot" />
          <span>
            <strong>Systems nominal</strong>
            <small>Last sync 10:42 UTC</small>
          </span>
        </div>
      </div>
    </aside>
  );
}
