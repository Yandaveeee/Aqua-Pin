import Link from "next/link";
import type { Database } from "@aquapin/shared";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import AdminUsersTable, { type AdminUserListItem } from "@/components/admin/AdminUsersTable";
import { requireApprovedAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type UsersPageProps = {
  searchParams?: Promise<{ q?: string }>;
};

type PublicProfile = Database["public"]["Tables"]["public_profiles"]["Row"];

const ENRICHED_PROFILE_FIELDS =
  "id, email, full_name, role, status, last_login_at, latest_latitude, latest_longitude, location_accuracy_m, location_label, municipality, barangay, region, location_updated_at, created_at, updated_at";

function fallbackName(email: string) {
  return email
    .split("@")[0]
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
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
  const query = safeSearch((await searchParams)?.q);
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
    let { data, error } = await usersQuery;

    if (error) {
      console.warn("Enriched staff profile fields are unavailable; using legacy profile data:", error.message);
      let legacyQuery = supabase
        .from("public_profiles")
        .select("id, email, role, status, created_at, updated_at")
        .order("created_at", { ascending: false });
      if (query) legacyQuery = legacyQuery.ilike("email", `%${query}%`);
      const legacyResult = await legacyQuery;
      data = (legacyResult.data ?? []).map((profile: any) => ({
        ...profile,
        full_name: fallbackName(profile.email),
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

  if (isMock && query) {
    const normalizedQuery = query.toLowerCase();
    users = users.filter(
      (user) =>
        user.email.toLowerCase().includes(normalizedQuery) ||
        user.full_name?.toLowerCase().includes(normalizedQuery)
    );
  }
  const fieldStaffCount = users.filter((user) => user.role === "field_staff").length;
  const adminCount = users.filter((user) => user.role === "admin").length;
  const userItems: AdminUserListItem[] = users.map((user) => ({
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
            <label className="field-label" htmlFor="q">Search users</label>
            <input className="field-input" defaultValue={query} id="q" name="q" placeholder="Name or email address" />
          </div>
          <button className="secondary-button" type="submit">Search</button>
          {query ? <Link className="secondary-button" href="/admin/users">Clear</Link> : null}
        </form>

        {users.length > 0 ? <AdminUsersTable users={userItems} /> : null}
        {users.length === 0 ? <div className="empty-panel"><p>No users found.</p></div> : null}
      </article>
    </section>
  );
}
