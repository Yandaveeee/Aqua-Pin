import Link from "next/link";
import { formatRelativeTime } from "@/lib/admin-format";
import { getDashboardOverview } from "@/lib/admin-data";

function DashboardMetricIcon({ type }: { type: "ponds" | "staff" | "records" | "alerts" }) {
  if (type === "ponds") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M12 3s6 6.2 6 11a6 6 0 0 1-12 0c0-4.8 6-11 6-11Z" />
        <path d="M8.5 15.5c1.7 1.4 4.2 1.4 7 0" />
      </svg>
    );
  }

  if (type === "staff") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <circle cx="9" cy="7" r="4" />
        <path d="M2 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2M17 8a4 4 0 0 1 0 7M22 21v-2a5 5 0 0 0-3-4.6" />
      </svg>
    );
  }

  if (type === "records") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <rect x="5" y="4" width="14" height="17" rx="2" />
        <path d="M9 4.5V3h6v1.5M9 10h6M9 14h6" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 3 2.8 20h18.4L12 3Z" />
      <path d="M12 9v5M12 17.5h.01" />
    </svg>
  );
}

export default async function AdminDashboardPage() {
  const overview = await getDashboardOverview(7);
  const alerts = overview.attentionItems.filter((item) => item.tone !== "info");
  const recentEvents = overview.recentEvents.slice(0, 5);
  const inactivePonds = Math.max(0, overview.counts.totalPonds - overview.counts.activePonds);
  const activePercent =
    overview.counts.totalPonds > 0
      ? Math.round((overview.counts.activePonds / overview.counts.totalPonds) * 100)
      : 0;

  const metrics = [
    {
      label: "Active ponds",
      value: `${overview.counts.activePonds}/${overview.counts.totalPonds}`,
      href: "/admin/ponds",
      tone: "success",
      type: "ponds",
      detail: overview.counts.lowStockCount > 0 ? `${overview.counts.lowStockCount} need review` : "All healthy",
    },
    {
      label: "Field staff",
      value: overview.counts.totalStaff.toString(),
      href: "/admin/users",
      tone: "info",
      type: "staff",
      detail: "On duty today",
    },
    {
      label: "Recent records",
      value: overview.recentEvents.length.toString(),
      href: "/admin/records?days=7",
      tone: "records",
      type: "records",
      detail: "Last 7 days",
    },
    {
      label: "Alerts",
      value: alerts.length.toString(),
      href: alerts.length > 0 ? "#dashboard-alerts" : "/admin/ponds",
      tone: alerts.length > 0 ? "danger" : "success",
      type: "alerts",
      detail: alerts.length > 0 ? "Needs attention" : "All clear",
    },
  ] as const;

  return (
    <section className="dashboard-overview">
      <div className="dashboard-overview-metrics">
        {metrics.map((metric) => (
          <Link
            className={`dashboard-overview-metric is-${metric.tone}`}
            href={metric.href}
            key={metric.label}
          >
            <span className="dashboard-overview-metric-head">
              <span className="dashboard-overview-metric-icon">
                <DashboardMetricIcon type={metric.type} />
              </span>
              <span>{metric.label}</span>
            </span>
            <strong>{metric.value}</strong>
            <small><i />{metric.detail}</small>
          </Link>
        ))}
      </div>

      {alerts.length > 0 ? (
        <section className="dashboard-alert-strip" id="dashboard-alerts" aria-label="Attention needed">
          <div className="dashboard-alert-strip-title">
            <span className="ui-pill ui-pill-danger">{alerts.length}</span>
            <strong>Attention needed</strong>
          </div>
          <div className="dashboard-alert-strip-items">
            {alerts.map((alert) => (
              <Link href={alert.href} key={alert.id}>
                <span>{alert.title}</span>
                <strong>View</strong>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <div className="dashboard-overview-grid">
        <section className="dashboard-overview-panel">
          <div className="dashboard-overview-panel-head">
            <h2>Pond status</h2>
            <Link href="/admin/ponds">View ponds</Link>
          </div>

          <div className="dashboard-pond-status">
            <div className="dashboard-pond-status-total">
              <strong>{overview.counts.totalPonds}</strong>
              <span>Total ponds</span>
            </div>

            <div
              className="dashboard-pond-status-bar"
              aria-label={`${activePercent}% of ponds are active`}
            >
              <span style={{ width: `${activePercent}%` }} />
            </div>

            <div className="dashboard-pond-status-legend">
              <span><i className="is-active" />Active <strong>{overview.counts.activePonds}</strong></span>
              <span><i className="is-inactive" />Inactive <strong>{inactivePonds}</strong></span>
              <span><i className="is-warning" />Low stock <strong>{overview.counts.lowStockCount}</strong></span>
            </div>
          </div>
        </section>

        <section className="dashboard-overview-panel">
          <div className="dashboard-overview-panel-head">
            <h2>Recent activity</h2>
            <Link href="/admin/records?days=7">View all</Link>
          </div>

          {recentEvents.length > 0 ? (
            <div className="dashboard-activity-list">
              {recentEvents.map((event) => (
                <article className="dashboard-activity-row" key={event.id}>
                  <span className={`ui-pill ui-pill-${event.tone}`}>{event.badge}</span>
                  <div>
                    <strong>{event.summary}</strong>
                    <span>{event.actorName}</span>
                  </div>
                  <time dateTime={event.createdAt}>{formatRelativeTime(event.createdAt)}</time>
                </article>
              ))}
            </div>
          ) : (
            <div className="dashboard-overview-empty">No activity in the last seven days.</div>
          )}
        </section>
      </div>
    </section>
  );
}
