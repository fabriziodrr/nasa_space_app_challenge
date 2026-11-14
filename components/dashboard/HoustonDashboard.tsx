import { DashboardIcon } from "@/components/dashboard/DashboardIcon";

export function HoustonDashboard() {
  return (
    <section className="dashboard-view" aria-labelledby="houston-dashboard-title">
      <div className="dashboard-view__intro">
        <div>
          <span className="dashboard-kicker">GROUND DESK / ACTIVE VIEW</span>
          <h2 id="houston-dashboard-title">Good morning, Houston.</h2>
          <p>Monitor mission health, crew activity and the next critical operations from one place.</p>
        </div>
        <div className="dashboard-view__date">
          <span>Mission day</span>
          <strong>042</strong>
          <small>14 Jun 2025 · 10:42 UTC</small>
        </div>
      </div>

      <div className="dashboard-kpi-grid">
        <article className="dashboard-card dashboard-kpi-card">
          <span className="dashboard-card__label">Mission health</span>
          <strong className="dashboard-kpi-card__value">98.4%</strong>
          <span className="dashboard-card__meta dashboard-card__meta--positive">+1.2% from last check</span>
        </article>
        <article className="dashboard-card dashboard-kpi-card">
          <span className="dashboard-card__label">Active systems</span>
          <strong className="dashboard-kpi-card__value">24 / 24</strong>
          <span className="dashboard-card__meta">All systems nominal</span>
        </article>
        <article className="dashboard-card dashboard-kpi-card">
          <span className="dashboard-card__label">Next contact</span>
          <strong className="dashboard-kpi-card__value">00:18:42</strong>
          <span className="dashboard-card__meta">TDRS relay window</span>
        </article>
        <article className="dashboard-card dashboard-kpi-card dashboard-kpi-card--accent">
          <span className="dashboard-card__label">Crew aboard</span>
          <strong className="dashboard-kpi-card__value">07</strong>
          <span className="dashboard-card__meta">Crew status confirmed</span>
        </article>
      </div>

      <div className="dashboard-content-grid">
        <article className="dashboard-card dashboard-card--large">
          <div className="dashboard-card__header">
            <div>
              <span className="dashboard-card__label">Mission activity</span>
              <h3>Operations timeline</h3>
            </div>
            <button className="dashboard-card__action" type="button" aria-label="Open operations timeline">
              <DashboardIcon name="arrow" size={17} />
            </button>
          </div>
          <div className="dashboard-timeline">
            <div className="dashboard-timeline__line" />
            <div className="dashboard-timeline__item is-complete">
              <span className="dashboard-timeline__dot" />
              <div><strong>Orbit adjustment burn</strong><small>Completed · 09:14 UTC</small></div>
            </div>
            <div className="dashboard-timeline__item is-current">
              <span className="dashboard-timeline__dot" />
              <div><strong>Payload systems check</strong><small>In progress · Houston team</small></div>
            </div>
            <div className="dashboard-timeline__item">
              <span className="dashboard-timeline__dot" />
              <div><strong>Earth observation window</strong><small>Scheduled · 11:30 UTC</small></div>
            </div>
          </div>
        </article>

        <article className="dashboard-card dashboard-card--large">
          <div className="dashboard-card__header">
            <div>
              <span className="dashboard-card__label">Live telemetry</span>
              <h3>System overview</h3>
            </div>
            <span className="dashboard-status-pill"><span />Live</span>
          </div>
          <div className="dashboard-chart" aria-label="Stable telemetry trend illustration" role="img">
            <div className="dashboard-chart__grid" />
            <svg viewBox="0 0 520 160" preserveAspectRatio="none" aria-hidden="true">
              <path d="M0 112 C30 108 40 115 66 102 S100 88 126 96 S170 118 194 92 S232 72 256 83 S292 94 316 66 S350 48 378 62 S412 76 438 45 S480 52 520 26" />
            </svg>
          </div>
          <div className="dashboard-chart__legend"><span><i />Power bus</span><strong>Nominal · 28.6V</strong></div>
        </article>
      </div>
    </section>
  );
}
