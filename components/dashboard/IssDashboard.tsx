import { DashboardIcon } from "@/components/dashboard/DashboardIcon";

export function IssDashboard() {
  return (
    <section className="dashboard-view" aria-labelledby="iss-dashboard-title">
      <div className="dashboard-view__intro">
        <div>
          <span className="dashboard-kicker">ON ORBIT / ACTIVE VIEW</span>
          <h2 id="iss-dashboard-title">ISS Astronaut</h2>
          <p>A focused view for the crew aboard the station and the rhythm of life in orbit.</p>
        </div>
        <div className="dashboard-view__date">
          <span>Station time</span>
          <strong>10:42</strong>
          <small>Orbit 28,104 · UTC</small>
        </div>
      </div>

      <div className="dashboard-kpi-grid">
        <article className="dashboard-card dashboard-kpi-card dashboard-kpi-card--accent">
          <span className="dashboard-card__label">Station status</span>
          <strong className="dashboard-kpi-card__value">Nominal</strong>
          <span className="dashboard-card__meta">All modules reporting</span>
        </article>
        <article className="dashboard-card dashboard-kpi-card">
          <span className="dashboard-card__label">Crew wellness</span>
          <strong className="dashboard-kpi-card__value">100%</strong>
          <span className="dashboard-card__meta dashboard-card__meta--positive">Daily check complete</span>
        </article>
        <article className="dashboard-card dashboard-kpi-card">
          <span className="dashboard-card__label">Next meal window</span>
          <strong className="dashboard-kpi-card__value">01:24:08</strong>
          <span className="dashboard-card__meta">Galley schedule</span>
        </article>
        <article className="dashboard-card dashboard-kpi-card">
          <span className="dashboard-card__label">Crew aboard</span>
          <strong className="dashboard-kpi-card__value">07</strong>
          <span className="dashboard-card__meta">All accounted for</span>
        </article>
      </div>

      <div className="dashboard-content-grid">
        <article className="dashboard-card dashboard-card--large">
          <div className="dashboard-card__header">
            <div>
              <span className="dashboard-card__label">Crew activity</span>
              <h3>Next on-orbit tasks</h3>
            </div>
            <button className="dashboard-card__action" type="button" aria-label="Open crew activity">
              <DashboardIcon name="arrow" size={17} />
            </button>
          </div>
          <div className="dashboard-task-list">
            <div className="dashboard-task"><span className="dashboard-task__time">11:10</span><span><strong>Node 2 inventory</strong><small>Commander · scheduled</small></span><span className="dashboard-task__state">Ready</span></div>
            <div className="dashboard-task"><span className="dashboard-task__time">12:45</span><span><strong>Exercise protocol</strong><small>Tranquility · scheduled</small></span><span className="dashboard-task__state">Ready</span></div>
            <div className="dashboard-task"><span className="dashboard-task__time">14:20</span><span><strong>Earth observation</strong><small>Window 04 · pending</small></span><span className="dashboard-task__state">Queued</span></div>
          </div>
        </article>

        <article className="dashboard-card dashboard-card--large dashboard-card--orbital">
          <div className="dashboard-card__header">
            <div>
              <span className="dashboard-card__label">Orbital position</span>
              <h3>Station pass</h3>
            </div>
            <DashboardIcon name="orbit" size={20} />
          </div>
          <div className="dashboard-orbit-visual"><span className="dashboard-orbit-visual__earth" /><span className="dashboard-orbit-visual__station" /></div>
          <div className="dashboard-chart__legend"><span><i />Current position</span><strong>408 km altitude</strong></div>
        </article>
      </div>
    </section>
  );
}
