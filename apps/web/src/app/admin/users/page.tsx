import Link from "next/link";
import type { Database } from "@aquapin/shared";
import AdminUsersTable, { type AdminUserListItem } from "@/components/admin/AdminUsersTable";
import { requireApprovedAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type UsersPageProps = {
  searchParams?: Promise<{ q?: string; role?: string; status?: string; location?: string; page?: string }>;
};

type PublicProfile = Database["public"]["Tables"]["public_profiles"]["Row"];

const ENRICHED_PROFILE_FIELDS =
  "id, email, full_name, role, status, last_login_at, latest_latitude, latest_longitude, location_accuracy_m, location_label, municipality, barangay, region, location_updated_at, created_at, updated_at";

function fallbackName(email: string) {
  return email;
}

function mockProfile(input: {
  id: string;
  email: string;
  fullName: string;
  role: PublicProfile["role"];
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  locationLabel?: string | null;
  municipality?: string | null;
  barangay?: string | null;
  region?: string | null;
}): PublicProfile {
  return {
    id: input.id,
    email: input.email,
    full_name: input.fullName,
    role: input.role,
    status: "approved",
    last_login_at: input.lastLoginAt ?? null,
    latest_latitude: input.latitude ?? null,
    latest_longitude: input.longitude ?? null,
    location_accuracy_m: input.latitude != null ? 12 : null,
    location_label: input.locationLabel ?? null,
    municipality: input.municipality ?? null,
    barangay: input.barangay ?? null,
    region: input.region ?? null,
    location_updated_at: input.latitude != null ? input.updatedAt : null,
    created_at: input.createdAt,
    updated_at: input.updatedAt,
  };
}

function safeSearch(value: string | undefined) {
  return (value ?? "").trim().slice(0, 120);
}

export default async function AdminUsersPage({ searchParams }: UsersPageProps) {
  await requireApprovedAdmin();
  const params = await searchParams;
  const query = safeSearch(params?.q);
  const role = params?.role === "admin" || params?.role === "field_staff" ? params.role : "all";
  const status = params?.status === "pending" || params?.status === "approved" ? params.status : "all";
  const location = params?.location === "reported" || params?.location === "missing" ? params.location : "all";
  const requestedPage = Math.max(1, Number.parseInt(params?.page ?? "1", 10) || 1);
  const { cookies } = await import("next/headers");
  const isMock = (await cookies()).get("aquapin_mock_admin")?.value === "true";
  let users: PublicProfile[] = [];

  if (isMock) {
    const now = Date.now();
    users = [
      mockProfile({ id: "mock-admin", email: "admin@aquapin.com", fullName: "AquaPin Administrator", role: "admin", createdAt: new Date(now - 30 * 864e5).toISOString(), updatedAt: new Date(now - 864e5).toISOString(), lastLoginAt: new Date(now - 2 * 3600e3).toISOString() }),
      mockProfile({ id: "mock-staff-miguel", email: "miguel@aquapin.com", fullName: "Miguel Cruz", role: "field_staff", createdAt: new Date(now - 18 * 864e5).toISOString(), updatedAt: new Date(now - 3 * 3600e3).toISOString(), lastLoginAt: new Date(now - 3 * 3600e3).toISOString(), latitude: 14.6124, longitude: 121.0124, locationLabel: "Laguna North Farm, Los Baños", municipality: "Los Baños", barangay: "Bayog", region: "CALABARZON" }),
      mockProfile({ id: "mock-staff-sarah", email: "sarah@aquapin.com", fullName: "Sarah Santos", role: "field_staff", createdAt: new Date(now - 11 * 864e5).toISOString(), updatedAt: new Date(now - 6 * 3600e3).toISOString(), lastLoginAt: new Date(now - 6 * 3600e3).toISOString(), latitude: 14.5824, longitude: 120.9724, locationLabel: "Laguna South Grow-out Area", municipality: "Calamba", barangay: "Real", region: "CALABARZON" }),
      mockProfile({ id: "mock-staff-jose", email: "jose@aquapin.com", fullName: "Jose Rizal", role: "field_staff", createdAt: new Date(now - 6 * 864e5).toISOString(), updatedAt: new Date(now - 12 * 3600e3).toISOString(), lastLoginAt: null, latitude: 14.6542, longitude: 121.1524, locationLabel: "Rizal Hillside Pond Area", municipality: "Antipolo", barangay: "San Jose", region: "CALABARZON" }),
    ];
  } else {
    const supabase = await createSupabaseServerClient();
    let usersQuery = supabase
      .from("public_profiles")
      .select(ENRICHED_PROFILE_FIELDS)
      .order("created_at", { ascending: false });
    if (query) usersQuery = usersQuery.or(`email.ilike.%${query}%,full_name.ilike.%${query}%`);
    if (role !== "all") usersQuery = usersQuery.eq("role", role);
    if (status !== "all") usersQuery = usersQuery.eq("status", status);
    let { data, error } = await usersQuery;

    if (error) {
      console.warn("Enriched staff profile fields are unavailable; using legacy profile data:", error.message);
      let legacyQuery = supabase
        .from("public_profiles")
        .select("id, email, full_name, role, status, created_at, updated_at")
        .order("created_at", { ascending: false });
      if (query) legacyQuery = legacyQuery.or(`email.ilike.%${query}%,full_name.ilike.%${query}%`);
      if (role !== "all") legacyQuery = legacyQuery.eq("role", role);
      if (status !== "all") legacyQuery = legacyQuery.eq("status", status);
      let legacyResult: { data: Partial<PublicProfile>[] | null; error: { message: string } | null } = await legacyQuery;
      if (legacyResult.error) {
        let basicQuery = supabase.from("public_profiles")
          .select("id, email, role, status, created_at, updated_at")
          .order("created_at", { ascending: false });
        if (query) basicQuery = basicQuery.ilike("email", `%${query}%`);
        if (role !== "all") basicQuery = basicQuery.eq("role", role);
        if (status !== "all") basicQuery = basicQuery.eq("status", status);
        const basicResult = await basicQuery;
        legacyResult = { ...basicResult, data: (basicResult.data as Partial<PublicProfile>[] | null)?.map((profile) => ({ ...profile, full_name: null })) ?? null };
      }
      data = (legacyResult.data ?? []).map((profile: any) => ({
        ...profile,
        full_name: profile.full_name?.trim() || fallbackName(profile.email),
        last_login_at: null,
        latest_latitude: null,
        latest_longitude: null,
        location_accuracy_m: null,
        location_label: null,
        municipality: null,
        barangay: null,
        region: null,
        location_updated_at: null,
      })) as any;
      error = legacyResult.error as any;
    }

    if (error) console.error("Failed to load users:", error.message);
    users = (data ?? []) as unknown as PublicProfile[];
  }

  const normalizedQuery = query.toLowerCase();
  users = users.filter((user) =>
    (!query || user.email.toLowerCase().includes(normalizedQuery) || user.full_name?.toLowerCase().includes(normalizedQuery)) &&
    (role === "all" || user.role === role) &&
    (status === "all" || user.status === status) &&
    (location === "all" || (location === "reported" ? user.latest_latitude != null : user.latest_latitude == null))
  );
  const fieldStaffCount = users.filter((user) => user.role === "field_staff").length;
  const adminCount = users.filter((user) => user.role === "admin").length;
  const pendingCount = users.filter((user) => user.status === "pending").length;
  const pageCount = Math.max(1, Math.ceil(users.length / 25));
  const page = Math.min(requestedPage, pageCount);
  const userItems: AdminUserListItem[] = users.slice((page - 1) * 25, page * 25).map((user) => ({
    id: user.id,
    fullName: user.full_name?.trim() || fallbackName(user.email),
    email: user.email,
    role: user.role,
    status: user.status,
    createdAt: user.created_at,
    lastLoginAt: user.last_login_at,
    locationLabel: user.location_label,
    region: user.region,
  }));

  return (
    <section className="stack staff-users-page">
      <div className="card-grid three-col">
        <article className="metric-card"><p className="metric-label">All users</p><p className="metric-value">{users.length}</p><p className="metric-detail">Accounts visible in AquaPin</p></article>
        <article className="metric-card"><p className="metric-label">Field staff</p><p className="metric-value">{fieldStaffCount}</p><p className="metric-detail">Mobile field-operation accounts</p></article>
        <article className="metric-card"><p className="metric-label">Administrators</p><p className="metric-value">{adminCount}</p><p className="metric-detail">Web console access</p></article>
      </div>

      {pendingCount > 0 ? <div className="users-approval-callout"><div><strong>{pendingCount} account request{pendingCount === 1 ? "" : "s"} need review</strong><span>Approve access before staff can use protected operations.</span></div><Link className="primary-button" href="/admin/approvals">Review approvals</Link></div> : null}

      <article className="panel">
        <form className="users-filter-form" method="GET">
          <div className="filter-field">
            <label className="field-label" htmlFor="q">Search users</label>
            <input className="field-input" defaultValue={query} id="q" name="q" type="search" placeholder="Name or email address" />
          </div>
          <label className="filter-field"><span className="field-label">Role</span><select className="field-input" name="role" defaultValue={role}><option value="all">All roles</option><option value="field_staff">Field staff</option><option value="admin">Administrators</option></select></label>
          <label className="filter-field"><span className="field-label">Status</span><select className="field-input" name="status" defaultValue={status}><option value="all">All statuses</option><option value="approved">Active</option><option value="pending">Pending</option></select></label>
          <label className="filter-field"><span className="field-label">Location</span><select className="field-input" name="location" defaultValue={location}><option value="all">Any location</option><option value="reported">Reported</option><option value="missing">Not reported</option></select></label>
          <div className="users-filter-actions"><button className="primary-button" type="submit">Apply filters</button><Link className="secondary-button" href="/admin/users">Clear</Link></div>
        </form>

        {users.length > 0 ? <AdminUsersTable users={userItems} /> : null}
        {users.length === 0 ? <div className="empty-panel"><p>No users found.</p></div> : null}
        {pageCount > 1 ? <nav className="pager" aria-label="Users pagination"><Link className={`secondary-button ${page === 1 ? "is-disabled" : ""}`} aria-disabled={page === 1} href={`?${new URLSearchParams({ ...(query ? { q: query } : {}), ...(role !== "all" ? { role } : {}), ...(status !== "all" ? { status } : {}), ...(location !== "all" ? { location } : {}), page: String(Math.max(1, page - 1)) })}`}>Previous</Link><span>Page {page} of {pageCount}</span><Link className={`secondary-button ${page === pageCount ? "is-disabled" : ""}`} aria-disabled={page === pageCount} href={`?${new URLSearchParams({ ...(query ? { q: query } : {}), ...(role !== "all" ? { role } : {}), ...(status !== "all" ? { status } : {}), ...(location !== "all" ? { location } : {}), page: String(Math.min(pageCount, page + 1)) })}`}>Next</Link></nav> : null}
      </article>
    </section>
  );
}
