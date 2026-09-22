function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`ui-skeleton ${className}`.trim()} />;
}

function SkeletonMetricCards({ count }: { count: number }) {
  return (
    <div className="card-grid admin-metric-grid">
      {Array.from({ length: count }).map((_, index) => (
        <article className="metric-card" key={index}>
          <SkeletonBlock className="ui-skeleton-line ui-skeleton-label" />
          <SkeletonBlock className="ui-skeleton-metric" />
          <SkeletonBlock className="ui-skeleton-line ui-skeleton-medium" />
          <SkeletonBlock className="ui-skeleton-line ui-skeleton-wide" />
        </article>
      ))}
    </div>
  );
}

function SkeletonHeader() {
  return (
    <header className="page-header panel">
      <div className="page-header-copy">
        <SkeletonBlock className="ui-skeleton-pill ui-skeleton-pill-short" />
        <SkeletonBlock className="ui-skeleton-title" />
        <SkeletonBlock className="ui-skeleton-line ui-skeleton-wide" />
        <SkeletonBlock className="ui-skeleton-line ui-skeleton-medium" />
      </div>
      <div className="page-tools">
        <SkeletonBlock className="ui-skeleton-pill" />
        <SkeletonBlock className="ui-skeleton-pill ui-skeleton-pill-short" />
        <SkeletonBlock className="ui-skeleton-button" />
      </div>
    </header>
  );
}

function SkeletonPanel({
  lines = 3,
  withChips = false,
  withRows = 0,
}: {
  lines?: number;
  withChips?: boolean;
  withRows?: number;
}) {
  return (
    <article className="panel">
      <div className="panel-header-row">
        <div className="ui-skeleton-cluster">
          <SkeletonBlock className="ui-skeleton-heading" />
          <SkeletonBlock className="ui-skeleton-line ui-skeleton-wide" />
        </div>
        <SkeletonBlock className="ui-skeleton-pill ui-skeleton-pill-short" />
      </div>

      {withChips ? (
        <div className="chip-row skeleton-chip-row">
          <SkeletonBlock className="ui-skeleton-pill ui-skeleton-pill-short" />
          <SkeletonBlock className="ui-skeleton-pill ui-skeleton-pill-short" />
          <SkeletonBlock className="ui-skeleton-pill ui-skeleton-pill-short" />
        </div>
      ) : null}

      <div className="ui-skeleton-cluster">
        {Array.from({ length: lines }).map((_, index) => (
          <SkeletonBlock
            className={`ui-skeleton-line ${index === lines - 1 ? "ui-skeleton-medium" : "ui-skeleton-wide"}`}
            key={index}
          />
        ))}
      </div>

      {withRows > 0 ? (
        <div className="skeleton-table">
          {Array.from({ length: withRows }).map((_, index) => (
            <div className="skeleton-table-row" key={index}>
              <SkeletonBlock className="ui-skeleton-line ui-skeleton-short" />
              <SkeletonBlock className="ui-skeleton-line ui-skeleton-medium" />
              <SkeletonBlock className="ui-skeleton-line ui-skeleton-short" />
              <SkeletonBlock className="ui-skeleton-line ui-skeleton-medium" />
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function SkeletonTimelineCards({ count }: { count: number }) {
  return (
    <article className="panel">
      <div className="panel-header-row">
        <div className="ui-skeleton-cluster">
          <SkeletonBlock className="ui-skeleton-heading" />
          <SkeletonBlock className="ui-skeleton-line ui-skeleton-wide" />
        </div>
        <SkeletonBlock className="ui-skeleton-pill ui-skeleton-pill-short" />
      </div>

      <div className="timeline-list">
        {Array.from({ length: count }).map((_, index) => (
          <article className="timeline-card" key={index}>
            <div className="timeline-head">
              <div className="timeline-badges">
                <SkeletonBlock className="ui-skeleton-pill ui-skeleton-pill-short" />
                <SkeletonBlock className="ui-skeleton-pill ui-skeleton-pill-short" />
              </div>
              <SkeletonBlock className="ui-skeleton-line ui-skeleton-short" />
            </div>

            <SkeletonBlock className="ui-skeleton-line ui-skeleton-wide" />
            <SkeletonBlock className="ui-skeleton-line ui-skeleton-wide" />
            <SkeletonBlock className="ui-skeleton-line ui-skeleton-medium" />

            <div className="timeline-meta">
              <SkeletonBlock className="ui-skeleton-line ui-skeleton-short" />
              <SkeletonBlock className="ui-skeleton-line ui-skeleton-short" />
            </div>
          </article>
        ))}
      </div>
    </article>
  );
}

export function AdminDashboardLoading() {
  return (
    <section className="stack" aria-busy="true" aria-live="polite">
      <SkeletonHeader />
      <SkeletonMetricCards count={6} />

      <div className="card-grid two-col dashboard-split-grid">
        <SkeletonPanel lines={4} />
        <SkeletonPanel lines={3} />
      </div>

      <SkeletonTimelineCards count={4} />
    </section>
  );
}

export function AdminApprovalsLoading() {
  return (
    <section className="stack" aria-busy="true" aria-live="polite">
      <SkeletonHeader />
      <SkeletonMetricCards count={3} />
      <SkeletonPanel lines={1} withChips />

      <article className="panel">
        <div className="panel-header-row">
          <div className="ui-skeleton-cluster">
            <SkeletonBlock className="ui-skeleton-heading" />
            <SkeletonBlock className="ui-skeleton-line ui-skeleton-wide" />
          </div>
          <div className="bulk-action-bar">
            <SkeletonBlock className="ui-skeleton-input" />
            <SkeletonBlock className="ui-skeleton-button" />
          </div>
        </div>

        <div className="skeleton-table skeleton-table-spacious">
          {Array.from({ length: 5 }).map((_, index) => (
            <div className="skeleton-table-row skeleton-table-row-wide" key={index}>
              <SkeletonBlock className="ui-skeleton-square" />
              <SkeletonBlock className="ui-skeleton-line ui-skeleton-medium" />
              <SkeletonBlock className="ui-skeleton-pill ui-skeleton-pill-short" />
              <SkeletonBlock className="ui-skeleton-line ui-skeleton-short" />
              <SkeletonBlock className="ui-skeleton-line ui-skeleton-short" />
              <SkeletonBlock className="ui-skeleton-line ui-skeleton-medium" />
              <SkeletonBlock className="ui-skeleton-button ui-skeleton-button-small" />
            </div>
          ))}
        </div>
      </article>

      <SkeletonPanel lines={0} withRows={4} />
    </section>
  );
}

export function AdminSettingsLoading() {
  return (
    <section className="stack" aria-busy="true" aria-live="polite">
      <SkeletonHeader />
      <SkeletonMetricCards count={3} />

      <article className="panel">
        <div className="panel-header-row">
          <div className="ui-skeleton-cluster">
            <SkeletonBlock className="ui-skeleton-heading" />
            <SkeletonBlock className="ui-skeleton-line ui-skeleton-wide" />
          </div>
          <SkeletonBlock className="ui-skeleton-pill ui-skeleton-pill-short" />
        </div>

        <div className="settings-grid">
          {Array.from({ length: 3 }).map((_, index) => (
            <article className="settings-card" key={index}>
              <div className="settings-card-head">
                <div className="ui-skeleton-cluster">
                  <SkeletonBlock className="ui-skeleton-line ui-skeleton-short" />
                  <SkeletonBlock className="ui-skeleton-heading" />
                  <SkeletonBlock className="ui-skeleton-line ui-skeleton-wide" />
                </div>
                <div className="ui-skeleton-cluster">
                  <SkeletonBlock className="ui-skeleton-line ui-skeleton-short" />
                  <SkeletonBlock className="ui-skeleton-line ui-skeleton-medium" />
                </div>
              </div>

              <div className="settings-field-grid">
                <SkeletonBlock className="ui-skeleton-input" />
                <SkeletonBlock className="ui-skeleton-input" />
                <SkeletonBlock className="ui-skeleton-input" />
                <SkeletonBlock className="ui-skeleton-input" />
              </div>

              <div className="settings-card-footer">
                <SkeletonBlock className="ui-skeleton-button" />
              </div>
            </article>
          ))}
        </div>
      </article>

      <SkeletonPanel lines={0} withRows={4} />
    </section>
  );
}

export function AdminFeatureLoading({ label }: { label: string }) {
  return (
    <section className="stack" role="status" aria-busy="true" aria-label={`Loading ${label}`}>
      <p className="muted">Loading {label}…</p>
      <SkeletonHeader />
      <SkeletonPanel lines={1} withRows={5} />
    </section>
  );
}
