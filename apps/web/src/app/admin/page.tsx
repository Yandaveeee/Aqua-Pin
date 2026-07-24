import Link from "next/link";
import { formatRelativeTime } from "@/lib/admin-format";
import { getDashboardOverview } from "@/lib/admin-data";

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
    },
    {
      label: "Field staff",
      value: overview.counts.totalStaff.toString(),
      href: "/admin/users",
      tone: "neutral",
    },
    {
      label: "Recent records",
      value: overview.recentEvents.length.toString(),
      href: "/admin/records?days=7",
      tone: "info",
    },
    {
      label: "Alerts",
      value: alerts.length.toString(),
      href: alerts.length > 0 ? "#dashboard-alerts" : "/admin/ponds",
      tone: alerts.length > 0 ? "danger" : "success",
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
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
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
