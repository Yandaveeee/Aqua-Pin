import Link from "next/link";
import type { Database } from "@aquapin/shared";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { formatDateTime, formatRelativeTime } from "@/lib/admin-format";
import { requireApprovedAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type UsersPageProps = {
  searchParams?: Promise<{ q?: string }>;
};

type PublicProfile = Database["public"]["Tables"]["public_profiles"]["Row"];

function safeSearch(value: string | undefined) {
  return (value ?? "").trim().slice(0, 120);
}

export default async function AdminUsersPage({ searchParams }: UsersPageProps) {
  await requireApprovedAdmin();
  const query = safeSearch((await searchParams)?.q);
  const { cookies } = await import("next/headers");
  const isMock = (await cookies()).get("aquapin_mock_admin")?.value === "true";
  let users: PublicProfile[] = [];

  if (isMock) {
    const now = Date.now();
    users = [
      { id: "mock-admin", email: "admin@aquapin.com", role: "admin", status: "approved", created_at: new Date(now - 30 * 864e5).toISOString(), updated_at: new Date(now - 864e5).toISOString() },
      { id: "mock-staff-miguel", email: "miguel@aquapin.com", role: "field_staff", status: "approved", created_at: new Date(now - 18 * 864e5).toISOString(), updated_at: new Date(now - 3 * 3600e3).toISOString() },
      { id: "mock-staff-sarah", email: "sarah@aquapin.com", role: "field_staff", status: "approved", created_at: new Date(now - 11 * 864e5).toISOString(), updated_at: new Date(now - 6 * 3600e3).toISOString() },
      { id: "mock-staff-jose", email: "jose@aquapin.com", role: "field_staff", status: "approved", created_at: new Date(now - 6 * 864e5).toISOString(), updated_at: new Date(now - 12 * 3600e3).toISOString() },
    ];
  } else {
    const supabase = await createSupabaseServerClient();
    let usersQuery = supabase
      .from("public_profiles")
      .select("id, email, role, status, created_at, updated_at")
      .order("created_at", { ascending: false });
    if (query) usersQuery = usersQuery.ilike("email", `%${query}%`);
    const { data, error } = await usersQuery;
    if (error) console.error("Failed to load users:", error.message);
    users = (data ?? []) as PublicProfile[];
  }

  if (isMock && query) users = users.filter((user) => user.email.toLowerCase().includes(query.toLowerCase()));
  const fieldStaffCount = users.filter((user) => user.role === "field_staff").length;
  const adminCount = users.filter((user) => user.role === "admin").length;

  return (
    <section className="stack">
      <AdminPageHeader
        eyebrow="Account Directory"
        title="Users"
        description="View the administrators and field staff who use AquaPin. New field staff are active by default—there is no approval queue."
        actions={<Link className="secondary-button" href="/admin/records">View records</Link>}
      />

      <div className="card-grid three-col">
        <article className="metric-card"><p className="metric-label">All users</p><p className="metric-value">{users.length}</p><p className="metric-detail">Accounts visible in AquaPin</p></article>
        <article className="metric-card"><p className="metric-label">Field staff</p><p className="metric-value">{fieldStaffCount}</p><p className="metric-detail">Mobile field-operation accounts</p></article>
        <article className="metric-card"><p className="metric-label">Administrators</p><p className="metric-value">{adminCount}</p><p className="metric-detail">Web console access</p></article>
      </div>

      <article className="panel">
        <form className="inline-form filter-form" method="GET">
          <div className="filter-field">
            <label className="field-label" htmlFor="q">Search by email</label>
            <input className="field-input" defaultValue={query} id="q" name="q" placeholder="staff@example.com" />
          </div>
          <button className="secondary-button" type="submit">Search</button>
          {query ? <Link className="secondary-button" href="/admin/users">Clear</Link> : null}
        </form>

        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>User</th><th>Role</th><th>Joined</th><th>Last profile update</th></tr></thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="table-primary-cell"><strong>{user.email}</strong><span>Active by default</span></td>
                  <td><span className={`ui-pill ${user.role === "admin" ? "ui-pill-info" : "ui-pill-ghost"}`}>{user.role === "admin" ? "Administrator" : "Field staff"}</span></td>
                  <td>{formatDateTime(user.created_at)}</td>
                  <td title={formatDateTime(user.updated_at)}>{formatRelativeTime(user.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {users.length === 0 ? <div className="empty-panel"><p>No users found.</p></div> : null}
      </article>
    </section>
  );
}
