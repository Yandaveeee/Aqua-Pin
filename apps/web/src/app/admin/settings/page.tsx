import type { Database, SettingSection } from "@aquapin/shared";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SettingsAuditDiff from "@/components/admin/SettingsAuditDiff";
import SettingsSectionForm from "@/components/admin/SettingsSectionForm";
import { updateAdminSettingAction } from "@/app/admin/settings/actions";
import { formatDateTime } from "@/lib/admin-format";
import { buildSettingsSectionStates, SETTINGS_SECTION_META } from "@/lib/admin-settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type AdminSettingsPageProps = {
  searchParams?: Promise<{ saved?: string; error?: string }>;
};

type AdminSettingsRow = Database["public"]["Tables"]["admin_settings"]["Row"];
type AdminSettingsAuditRow = Database["public"]["Tables"]["admin_settings_audit"]["Row"];
type PublicProfileRow = Database["public"]["Tables"]["public_profiles"]["Row"];

export default async function AdminSettingsPage({ searchParams }: AdminSettingsPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const isMock = cookieStore.get("aquapin_mock_admin")?.value === "true";

  let settingsRows: AdminSettingsRow[] = [];
  let auditRows: AdminSettingsAuditRow[] = [];
  let profileEmailMap = new Map<string, string>();

  if (isMock) {
    const { ADMIN_SETTINGS_DEFAULTS } = await import("@/lib/admin-settings");
    settingsRows = (Object.keys(ADMIN_SETTINGS_DEFAULTS) as Array<keyof typeof ADMIN_SETTINGS_DEFAULTS>).map((section) => ({
      section,
      value: ADMIN_SETTINGS_DEFAULTS[section] as any,
      updated_by: "system-mock-user-id",
      updated_at: new Date().toISOString(),
    })) as any;

    auditRows = [
      {
        id: "mock-audit-1",
        section: "operations",
        previous_value: {
          ...ADMIN_SETTINGS_DEFAULTS.operations,
          lowStockThreshold: 1000,
        } as any,
        new_value: ADMIN_SETTINGS_DEFAULTS.operations as any,
        changed_by: "system-mock-user-id",
        changed_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
      },
      {
        id: "mock-audit-2",
        section: "general",
        previous_value: {
          ...ADMIN_SETTINGS_DEFAULTS.general,
          organizationName: "AquaPin Operations",
        } as any,
        new_value: {
          ...ADMIN_SETTINGS_DEFAULTS.general,
          organizationName: "AquaPin Laguna Farm (Mock)",
        } as any,
        changed_by: "system-mock-user-id",
        changed_at: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
      },
    ] as any;

    profileEmailMap = new Map([
      ["system-mock-user-id", "admin@aquapin.com"]
    ]);
  } else {
    const supabase = await createSupabaseServerClient();
    const [settingsResult, auditResult] = await Promise.all([
      supabase
        .from("admin_settings")
        .select("section, value, updated_by, updated_at")
        .order("section", { ascending: true }),
      supabase
        .from("admin_settings_audit")
        .select("id, section, previous_value, new_value, changed_by, changed_at")
        .order("changed_at", { ascending: false })
        .limit(20),
    ]);

    settingsRows = (settingsResult.data ?? []) as AdminSettingsRow[];
    auditRows = (auditResult.data ?? []) as AdminSettingsAuditRow[];
    const settingsError = settingsResult.error;
    const auditError = auditResult.error;

    if (settingsError) {
      console.error("Failed to load admin settings:", settingsError.message);
    }

    if (auditError) {
      console.error("Failed to load settings audit:", auditError.message);
    }

    const profileIds = new Set<string>();
    auditRows.forEach((row) => profileIds.add(row.changed_by));
    settingsRows.forEach((row) => {
      if (row.updated_by) profileIds.add(row.updated_by);
    });

    if (profileIds.size > 0) {
      const { data: profilesData } = await supabase
        .from("public_profiles")
        .select("id, email")
        .in("id", Array.from(profileIds));
      const profiles = (profilesData ?? []) as Pick<PublicProfileRow, "id" | "email">[];
      profileEmailMap = new Map(profiles.map((profile) => [profile.id, profile.email]));
    }
  }

  const sectionStates = buildSettingsSectionStates(settingsRows);

  return (
    <section className="stack">
      <AdminPageHeader
        eyebrow="Configuration"
        title="Settings"
        description="Manage essential organization, pond-alert, and notification settings for AquaPin."
      />

      {params?.saved ? (
        <p className="flash-success">
          Saved <strong>{SETTINGS_SECTION_META[params.saved as SettingSection]?.title ?? params.saved}</strong>{" "}
          settings.
        </p>
      ) : null}
      {params?.error ? <p className="flash-error">{params.error}</p> : null}

      <div className="card-grid three-col">
        <article className="metric-card">
          <p className="metric-label">Sections</p>
          <p className="metric-value">{sectionStates.length}</p>
          <p className="metric-detail">Validated settings groups in the console</p>
        </article>
        <article className="metric-card">
          <p className="metric-label">Audit Entries</p>
          <p className="metric-value">{auditRows.length}</p>
          <p className="metric-detail">Recent settings changes available for review</p>
        </article>
        <article className="metric-card">
          <p className="metric-label">Latest Change</p>
          <p className="metric-value">{auditRows[0] ? formatDateTime(auditRows[0].changed_at) : "None"}</p>
          <p className="metric-detail">Most recent configuration write</p>
        </article>
      </div>

      <article className="panel">
        <div className="panel-header-row">
          <div>
            <h3 className="panel-title">Section Editors</h3>
            <p className="panel-subtitle">
              Keep the core settings that support the mobile field workflow up to date.
            </p>
          </div>
          <span className="ui-pill ui-pill-ghost">Structured forms</span>
        </div>

        <div className="settings-grid">
          {sectionStates.map((state) => (
            <SettingsSectionForm
              key={state.section}
              section={state.section}
              value={state.value}
              updatedAt={state.updatedAt}
              updatedByLabel={
                state.updatedBy ? profileEmailMap.get(state.updatedBy) ?? state.updatedBy : "System"
              }
            />
          ))}
        </div>
      </article>

      <article className="panel">
        <div className="panel-header-row">
          <div>
            <h3 className="panel-title">Recent Settings Audit</h3>
            <p className="panel-subtitle">
              Review field-level diffs and restore a previous configuration snapshot when needed.
            </p>
          </div>
          <span className="ui-pill ui-pill-ghost">{auditRows.length} entries</span>
        </div>

        <div className="settings-audit-list">
          {auditRows.length > 0 ? (
            auditRows.map((row) => {
              const section = row.section as SettingSection;

              return (
                <article className="settings-audit-card" key={row.id}>
                  <div className="settings-audit-head">
                    <div>
                      <div className="settings-audit-meta">
                        <span className="ui-pill ui-pill-info">
                          {SETTINGS_SECTION_META[section]?.title ?? row.section}
                        </span>
                        <span className="ui-pill ui-pill-ghost">{formatDateTime(row.changed_at)}</span>
                      </div>
                      <p className="settings-audit-actor">
                        Changed by {profileEmailMap.get(row.changed_by) ?? row.changed_by}
                      </p>
                    </div>

                    {row.previous_value ? (
                      <form action={updateAdminSettingAction}>
                        <input type="hidden" name="section" value={row.section} />
                        <input type="hidden" name="returnTo" value="/admin/settings" />
                        <input
                          type="hidden"
                          name="value"
                          value={JSON.stringify(row.previous_value)}
                        />
                        <button className="secondary-button" type="submit">
                          Restore Previous
                        </button>
                      </form>
                    ) : null}
                  </div>

                  <SettingsAuditDiff
                    section={section}
                    previousValue={row.previous_value}
                    nextValue={row.new_value}
                  />

                  <details className="detail-disclosure">
                    <summary>View raw before/after payload</summary>
                    <div className="settings-raw-grid">
                      <div>
                        <strong>Previous</strong>
                        <pre>{JSON.stringify(row.previous_value ?? {}, null, 2)}</pre>
                      </div>
                      <div>
                        <strong>New</strong>
                        <pre>{JSON.stringify(row.new_value, null, 2)}</pre>
                      </div>
                    </div>
                  </details>
                </article>
              );
            })
          ) : (
            <div className="empty-panel">
              <p>No settings audit entries yet.</p>
              <p className="muted">Save any section to create the first restoreable configuration snapshot.</p>
            </div>
          )}
        </div>
      </article>
    </section>
  );
}
